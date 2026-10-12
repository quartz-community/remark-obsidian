import type { Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/** Nothing but whitespace, allowing a container's own prefix. */
const REGION = /%%|<!--|-->/u;
const BLANK = /^[ \t]*(?:>[ \t]*)*$/u;

/**
 * A footnote definition does not end on a blank line.
 *
 * Where its body ends in an unclosed opener -- an indented fence, an indented
 * `$$` -- micromark lets that construct consume the blank line after it, because
 * indented code and an unclosed fence may legitimately contain blanks. The
 * definition's span grows by one line as a result. `remark-parse@8` stops at the
 * last line that holds something, and Obsidian parses with `remark-parse@8`:
 *
 *     [^1]: body            lines 0..1 to Obsidian, 0..2 to micromark
 *         ```
 *                           <- the blank micromark takes in
 *     next
 *
 * Measured against the legacy stack across four shapes, each one line out, and
 * it is the largest family in the recorded corpus's span disagreements.
 *
 * Only the definition's own end point moves. Its children already end where they
 * end, and the blank was never any node's content.
 */
/** One past the index of the line ending before `offset`, so column 1 is a line start. */
function lineStartAt(source: string, offset: number): number {
  return source.lastIndexOf("\n", offset - 1) + 2;
}

/** Whether an offset sits at the very start of its line. */
function endAtLineStart(source: string, offset: number | undefined): boolean {
  if (offset === undefined) return false;
  return (
    offset === 0 || source[offset - 1] === "\n" || source[offset - 1] === "\r"
  );
}

export function definitionTrimTransform(tree: Root, source: string): void {
  if (source === "") return;

  const lines = source.split("\n");
  visit(tree, "footnoteDefinition", (node: Node) => {
    const start = node.position?.start?.line;
    const end = node.position?.end?.line;
    if (start === undefined || end === undefined) return;

    let last = end;
    while (last > start && BLANK.test(lines[last - 1] ?? "")) last--;
    // Pulling a column-1 end back one line is REFUTED, and the reason is worth keeping
    // because the shape looks unambiguous and is not. `[^1]: def` over `    ``` ` over
    // `> Text[^Ä]` ends at 2:0 here and on line 1 in Obsidian, so the surplus is the line
    // ending itself. But `[^1]: one` / `    %%` / `hidden[^2] text` / `%%` also ends at a
    // column-1 position -- 5:0, the start of its own closer line -- and Obsidian wants
    // 5:2, the END of that line. One case wants the previous line, the other wants this
    // line, and the position cannot tell them apart: it turns on whether that line is the
    // definition's own content.
    //
    // Measured: referee 74.2% -> 74.7%, +33 documents, against 4 main-gate regressions
    // (`hunt/definition-block-owns-region-opener/0-3`) and compute `footnotes` 0 -> 5,
    // `sections` 0 -> 4. The main gate is the contract, so this does not ship.
    // A NESTED definition cannot absorb a bare `%%` sitting at column 0: that line is
    // outside the container the definition lives in, so it cannot continue it. Measured
    // over the referee corpus, splitting by the definition's own column:
    //
    //   definition at column 0, next line a bare `%%`   absorbs 53, ends on own line  1
    //   definition nested,      next line a bare `%%`   absorbs  0, ends on own line 10
    //
    // Ten of ten, no counter-examples. micromark takes the line as lazy paragraph
    // continuation and no option flag governs it, so the repair belongs here.
    // Derived from the OFFSET, not read off the point. Instrumented over the corpus,
    // this site reads a stale column 28 times against 1354 agreeing -- an earlier pass
    // moved the definition by offset and left the rest of the point behind, which is
    // exactly what `normalizePointsTransform` runs last to repair. A stale column read
    // into a POINT is repaired there; one read into a BRANCH, as both of this file's are,
    // is not. The audit table in `normalize-points.ts` had not been extended to cover
    // this file.
    const startOffset = node.position?.start?.offset;
    const column =
      startOffset === undefined
        ? (node.position?.start?.column ?? 1)
        : startOffset - (lineStartAt(source, startOffset) - 1);
    if (last === end && column > 1 && end > start) {
      const after = lines[start] ?? "";
      // A column-0 line that OPENS A BLOCK cannot continue a nested definition. Split by
      // that line's kind over the referee corpus, counting both sides:
      //
      //   next line a definition   11 end on own line,  0 absorb
      //   next line a heading       4 end on own line,  0 absorb
      //   next line a fence         4 end on own line,  0 absorb
      //   next line a bare `%%`    10 end on own line,  0 absorb
      //   next line a thematic     1 end on own line,  0 absorb
      //   next line plain TEXT      5 end on own line, 27 absorb  <- lazy continuation
      //   next line a list marker  42 end on own line, 13 absorb  <- not clean
      //
      // So plain text is genuine lazy continuation and is left alone, a list marker has
      // thirteen counter-examples and is left alone, and the four block openers plus the
      // bare comment are unanimous.
      const opensBlock =
        after.trim() === "%%" ||
        /^(?:#{1,6} |```|~~~|\[\^[^\]]*\]:|---|===|___|\*\*\*)/u.test(after);
      if (opensBlock && !/^[ \t>]/u.test(after)) last = start;
    }

    // A definition ending at the START of a line ends on the PREVIOUS one. Our end is
    // then one line past its own content, holding only that line's ending, and Obsidian
    // reports the content line -- 119 referee rows against 1, where the blank-line trim
    // above cannot fire because the preceding line has content.
    //
    // Guarded on the definition not having opened a `%%` region that is still open at
    // that line, which is the whole reason the unguarded form was refuted: there the
    // line is the definition's own closer, so Obsidian ends ON it at a non-zero column
    // rather than before it. The guard costs 4 referee rows and buys back the 4
    // `hunt/definition-block-owns-region-opener/*` cases, and the main gate is the
    // contract.
    if (
      last === end &&
      end > start &&
      // The end sits at the start of its line, derived from the offset for the reason
      // above: this read was stale 12 times against 224 agreeing.
      endAtLineStart(source, node.position?.end?.offset)
    ) {
      let region = false;
      for (let line = start; line < end; line++) {
        if (REGION.test(lines[line - 1] ?? "")) region = true;
      }
      if (!region) last = end - 1;
    }
    if (last === end) return;

    // Back to the end of that line, which is where the content stops.
    const text = lines[last - 1] ?? "";
    const offset = lines
      .slice(0, last - 1)
      .reduce((n, l) => n + l.length + 1, 0);
    node.position!.end = {
      line: last,
      column: text.length + 1,
      offset: offset + text.length,
    };
  });
}
