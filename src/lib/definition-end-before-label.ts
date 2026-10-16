import type { Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/** A footnote or link label starting a line, which is what E1 calls "another label". */
const LABEL = /^\[\^?[^\]]*\]:/u;

interface Point {
  line: number;
  column: number;
  offset?: number;
}

/**
 * A definition ends before a column-0 label line.
 *
 * E1 lists what ends a definition's text and "another label" is on it. Classifying the SURPLUS
 * line over all 113 `def-end+1` entries -- the line we absorb and Obsidian does not -- shows
 * how much of that family it accounts for:
 *
 *     39  text          lazy continuation, correct to absorb per E1
 *     38  definition    E1: another label ENDS a definition
 *     30  bullet        E1: list items end it
 *     10  heading       E1: ATX headings end it
 *      7  comment       D5: `%%` is lazy text, correct to absorb
 *      7  fence         E1: fences end it
 *
 * COLUMN 0 ONLY, which keeps it clear of the indentation argument: an indented label is the
 * definition's own content, and E1's enders are stated for a line that starts a block of its
 * own.
 *
 * THE ORPHANED CHILD IS THE REASON THIS WAS REFUSED TWICE, and it is solvable. In
 * `probes.json#388`, `[^9]: orphan` / `⟨4sp⟩<!--` / `[^1]: one` / `-->`, the first definition
 * ends on the label's own line and its indented `<!--` child extends into that line too, so
 * pulling the parent's end back alone leaves `child ENDS AFTER parent` for
 * `invariants.test.ts`. A guard that simply declined on that measured 0 gained and 0 lost --
 * the pass went inert. Clamping every descendant instead is the same descent discipline
 * `definition-math-absorb.ts` applies upward: a span is not corrected until every node on the
 * path is.
 *
 * AND THE TRADE IS SMALL AND REAL: referee 2 gained, 1 lost, agreement +1. The loss is
 * `broad-20261004.json#330`, where `["3",9,0,11]` matched the oracle and becomes
 * `["3",9,0,10]` -- an agreeing document, carried rather than hidden. It ships because
 * AGREEMENT RISES, which is the standard `definition-math-absorb.ts` set at 21 gained against
 * 10 lost; an earlier refusal here read `better/worse` instead and got the sign of the
 * decision wrong.
 */
export function definitionEndBeforeLabelTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;

  const lines = source.split("\n");
  visit(tree, "footnoteDefinition", (node: Node) => {
    const start = node.position?.start;
    const end = node.position?.end;
    if (!start || !end) return;

    for (let line = start.line; line < end.line; line++) {
      const text = lines[line] ?? "";
      // An INDENTED label is content, not an ender.
      if (/^[ \t]/u.test(text)) continue;
      if (!LABEL.test(text)) continue;

      let offset = 0;
      for (let at = 0; at < line - 1; at++) {
        offset += (lines[at] ?? "").length + 1;
      }
      const previous = lines[line - 1] ?? "";
      const reach: Point = {
        line,
        column: previous.length + 1,
        offset: offset + previous.length,
      };
      if ((end.offset ?? 0) <= (reach.offset ?? 0)) break;

      node.position!.end = { ...reach };
      visit(node, (inner: Node) => {
        const at = inner.position?.end;
        if (!at) return;
        if ((at.offset ?? 0) > (reach.offset ?? 0)) {
          inner.position!.end = { ...reach };
        }
      });
      break;
    }
  });
}
