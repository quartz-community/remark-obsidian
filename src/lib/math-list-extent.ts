import type { Root, RootContent } from "mdast";

import { mapLines, shiftByMap } from "./line-map.js";

/** A line holding nothing but whitespace. */
const BLANK = /^[ \t]*$/u;

interface MathNode {
  type: "math";
  value: string;
  position?: {
    start: { line: number; column: number; offset?: number };
    end: { line: number; column: number; offset?: number };
  };
}

/**
 * A blank line bounds an unclosed `$$` that a LIST is about to absorb.
 *
 * An unclosed display-math opener consumes to the end of the input in `remark-math`, which is
 * right at the top level and wrong directly after a list. Measured against 1.14.4 with six
 * controls, and the list is the whole discriminator:
 *
 *     $$ / blank / use[^1]                  math@0-3             root: runs to EOF
 *     - item / $$ / blank / use[^1]         list@0-1, para@3     BOUNDED by the blank line
 *     - item / $$ / more / blank / use[^1]  list@0-2, para@4     takes `more`, stops at blank
 *     > quote / $$ / blank / use[^1]        quote@0-0, math@1-4  not absorbed, runs to EOF
 *     - item / blank / $$ / blank / use[^1] list@0-0, math@2-5   list already closed
 *     para / $$ / blank / use[^1]           para@0-0, math@1-4   not absorbed either
 *
 * So the opener is bounded exactly when a list absorbs it, and runs on everywhere else. Our
 * tree had the list swallowing the formula AND everything past the blank line, which loses a
 * `footnoteReference` out of the tree entirely rather than merely misplacing a span.
 *
 * Runs BEFORE `containerLazyTransform`, which is what makes it small. At that point the math
 * is still a root sibling of the list, so bounding it here lets the existing absorption do
 * the rest -- the pass that already knows a list takes a `math` opener in, and that a quote
 * does not, needs no change. Trying to fix it after absorption would mean reaching into a
 * `listItem` to split a node the pass had just moved.
 *
 * The condition mirrors that pass's own: the previous root sibling is a `list` and nothing but
 * one line ending separates them. A blank line between is the `list already closed` row above,
 * where Obsidian runs the math to the end of the note and so do we.
 */
export function mathListExtentTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  for (let index = tree.children.length - 1; index >= 1; index--) {
    const node = tree.children[index];
    if (node?.type !== "math") continue;

    // Walk BACK to the list across any `footnoteDefinition` between, which is the chain
    // `containerLazyTransform` already follows -- a column-zero definition adjacent to a list
    // is swallowed by it, so the opener after one is still an opener after the list.
    //
    // `- item` / `[^1]: def` / `$$` leaves the definition as its own root sibling where every
    // other spacer is absorbed into the item's lazy paragraph first, so this is the only
    // widening the measured rows need: `bullet > footnote > math` and
    // `ordered > footnote > math` were the two the direct test could not reach.
    //
    // Restricted to that one type on purpose. Widening the same chain to `thematicBreak` and
    // `definition` is recorded in `container-lazy.ts` at 3 better against 23 worse, because
    // those are real blocks that END a list rather than continue it.
    let host = index - 1;
    while (host >= 0 && tree.children[host]?.type === "footnoteDefinition") {
      const gapFrom = tree.children[host]?.position?.end?.offset;
      const gapTo = tree.children[host + 1]?.position?.start?.offset;
      if (gapFrom === undefined || gapTo === undefined) break;
      if (source.slice(gapFrom, gapTo).includes("\n\n")) break;
      host--;
    }
    if (host < 0 || tree.children[host]?.type !== "list") continue;

    const math = node as unknown as MathNode;
    const from = math.position?.start?.offset;
    const to = math.position?.end?.offset;
    const previousEnd = tree.children[index - 1]?.position?.end?.offset;
    if (from === undefined || to === undefined || previousEnd === undefined) {
      continue;
    }
    // Directly after the list, with nothing but one line ending between. With a blank line
    // the list has already closed and the opener legitimately runs on.
    if (source.slice(previousEnd, from).trim() !== "") continue;
    if (source.slice(previousEnd, from).includes("\n\n")) continue;

    // Unclosed only. A closed block is bounded by its own closer and needs nothing.
    const written = source.slice(from, to);
    if (written.slice(2).includes("$$")) continue;

    const lines = written.split("\n");
    const blank = lines.findIndex(
      (line, offset) => offset > 0 && BLANK.test(line),
    );
    if (blank === -1) continue;

    // And only when what follows the blank line is at COLUMN ZERO. An indented line
    // continues the list ITEM across the blank, so the item never closed and nothing inside
    // it is bounded -- Obsidian reports one `list` spanning the lot:
    //
    //     - item / $$ / blank / `use[^1]`       list@0-1, paragraph@3   bounded
    //     - item / $$ / blank / `    indented`  list@0-3                absorbed
    //     - item / $$ / blank / `  two-space`   list@0-3                absorbed
    //
    // This guard is the whole difference between the rule and a regression. Without it
    // `hunt/fix-lazy-skip-not-revisited/0` broke: its tail is `    second para[^22]`, which
    // belongs to the item, and re-parsing it in isolation turned four spaces into a root
    // `code` block. The corpus caught that on the first run, and the first hypothesis for it
    // -- that `$$ tail` differs from a bare `$$` -- was refuted by three further controls
    // before the indent turned out to be the axis.
    const afterBlank = lines.slice(blank).find((line) => !BLANK.test(line));
    if (afterBlank !== undefined && /^[ \t]/u.test(afterBlank)) continue;

    const keptText = lines.slice(0, blank).join("\n");
    const cut = from + keptText.length;
    math.value = source.slice(from + 2, cut);
    if (math.position?.end) {
      math.position.end = {
        line: math.position.start.line + blank - 1,
        column: (lines[blank - 1] ?? "").length + 1,
        offset: cut,
      };
    }

    // Whatever sat past the blank line is its own block beside the list, re-parsed from
    // where it really starts so the formula does not claim it.
    const tailFrom = from + lines.slice(0, blank + 1).join("\n").length + 1;
    if (tailFrom >= to) continue;
    const map = mapLines(
      source,
      tailFrom,
      to,
      math.position!.start.line + blank + 1,
    );
    const tail = reparse(map.text);
    for (const child of tail.children) shiftByMap(child, map, 0);
    tree.children.splice(index + 1, 0, ...(tail.children as RootContent[]));
  }
}
