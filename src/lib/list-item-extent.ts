import type { List, ListItem, Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/**
 * A list item ends where the next one begins, at the latest.
 *
 * `remark-math` extends an item past its sibling's start when a `$$` opener shares its line
 * with content. Reproduced on `remark-parse` + `remark-math@6.0.0` with none of this package
 * loaded, and the control is what makes it precise:
 *
 *     1. Hello $$ / '   Math' / '   $$' / 2.      parse only  [0..25] [26..28]   no overlap
 *                                                 + math      [0..28] [26..28]   OVERLAP
 *     - a $$ / '  x' / '  $$' / - b                parse only  [0..15] [16..19]   no overlap
 *                                                 + math      [0..18] [16..19]   OVERLAP
 *     1. $$ / '   x' / '   $$' / 2.                + math      [0..16] [17..19]   no overlap
 *
 * So it needs content BEFORE the opener on the item's own line; a bare `1. $$` is correct.
 * Filed in `UPSTREAM.md`.
 *
 * Repaired here rather than only reported, which is the opposite of what this package does
 * for the `definition`/`heading` overlap in the same file. The difference is whether we hand
 * the defect to a consumer: that one appears in bare `remark-parse` output and nothing here
 * reads it, while this one is in the tree this package ships. `obsidian-linter` splices by
 * offset, and two overlapping items give it no edit order -- a wrong offset is worse than a
 * missing one.
 *
 * Only the END moves, and only ever backwards to the sibling's start. The item's children
 * already end where they end, and nothing is reparented: the overlap is the item's own span
 * claiming source that belongs to the next item.
 */
export function listItemExtentTransform(tree: Root): void {
  visit(tree, "list", (node: Node) => {
    const items = (node as List).children;
    for (const [index, item] of items.entries()) {
      const next = items[index + 1];
      if (!next) break;
      const end = item.position?.end;
      const start = next.position?.start;
      if (!end || !start) continue;
      if (end.offset === undefined || start.offset === undefined) continue;
      if (end.offset <= start.offset) continue;
      (item as ListItem).position!.end = { ...start };
    }
  });
}
