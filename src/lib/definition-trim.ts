import type { Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/** Nothing but whitespace, allowing a container's own prefix. */
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
    const column = node.position?.start?.column ?? 1;
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
