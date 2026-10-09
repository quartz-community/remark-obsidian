import type { List, ListItem, Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

const TAB_SIZE = 4;

/** A marker and the single whitespace that separates it from the content. */
const MARKER = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]/u;

/** The column a run of text ends at, expanding tabs to the next stop. */
function columnAfter(text: string, from = 0): number {
  let column = from;
  for (const character of text) {
    column =
      character === "\t"
        ? (Math.floor(column / TAB_SIZE) + 1) * TAB_SIZE
        : column + 1;
  }
  return column;
}

/** The column an item's content starts at, or undefined if the line has no marker. */
function contentColumn(source: string, item: ListItem): number | undefined {
  const from = item.position?.start?.offset;
  if (from === undefined) return undefined;
  const bol = source.lastIndexOf("\n", from - 1) + 1;
  const line = source.slice(bol, source.indexOf("\n", from) + 1 || undefined);
  const opener = MARKER.exec(line);
  return opener ? columnAfter(opener[0]) : undefined;
}

/**
 * A tab split across a container boundary contributes nothing to the inner indent.
 *
 * ` - foo` / `   - bar` / `\t - baz` nests `baz` two deep for us and Obsidian keeps it a
 * sibling of `bar`. The outer item's content starts at column 3, the tab spans columns 0
 * to 4, so the outer container consumes three of its four columns and the inner sees the
 * leftover fragment -- and in `remark-parse@8` that fragment counts for nothing, so only
 * the following space is left where two columns are needed.
 *
 * Measured against the legacy stack across six shapes, which is what separates this from
 * the reading recorded on the case earlier:
 *
 *     - foo / \t- bar          -> nested    (root content column 0, so no straddle at
 *                                 all and the tab keeps its full four columns)
 *     - foo / '  '- bar        -> nested    (two columns, exactly the threshold)
 *     - foo / ' '- bar         -> flat      (one column)
 *      - foo / '   '- bar / \t- baz    -> sibling  (fragment dropped, nothing left)
 *      - foo / '   '- bar / \t' '- baz -> sibling  (fragment dropped, one space left)
 *      - foo / '   '- bar / \t'  '- baz -> nested  (fragment dropped, two spaces left)
 *
 * Discarding tab width *globally* was tried and refuted -- 0 gains against 4 regressions
 * (`task/nested-tab`, `document/tab-indentation`, `commonmark/tabs/4`,
 * `commonmark/tabs/5`), because ordinary tab continuation genuinely needs the column
 * width. Only the straddling fragment is dropped here, and a straddle needs a real outer
 * container, so both tab controls in the corpus are top-level and cannot be reached:
 * `- [ ] parent` / `\t- [ ] child` and `- a` / `\t- [x] b` both keep nesting.
 *
 * Written as a repair because the decision needs the enclosing item's content column and
 * the sublist's opener line together, which a streaming container tokenizer does not have
 * in one place.
 */
export function listTabStraddleTransform(tree: Root, source: string): void {
  if (!source.includes("\t")) return;

  visit(tree, "list", (node: Node, _index, parent) => {
    // The straddle needs an outer container to eat part of the tab, so the chain
    // must be outer item > list > item > this sublist.
    const inner = parent as ListItem | undefined;
    if (inner?.type !== "listItem") return;
    const sublist = node as List;

    const from = sublist.position?.start?.offset;
    if (from === undefined) return;
    const bol = source.lastIndexOf("\n", from - 1) + 1;
    const prefix = source.slice(bol, from);
    if (!prefix.includes("\t") || prefix.trim() !== "") return;

    const outer = findOuterItem(tree, inner);
    if (!outer) return;
    const outerContent = contentColumn(source, outer);
    const innerContent = contentColumn(source, inner);
    if (outerContent === undefined || innerContent === undefined) return;

    // The fragment of a tab that crosses the outer container's content column.
    let column = 0;
    let discarded = 0;
    for (const character of prefix) {
      const next = columnAfter(character, column);
      if (character === "\t" && column < outerContent && next > outerContent) {
        discarded += next - outerContent;
      }
      column = next;
    }
    if (discarded === 0) return;

    const effective = column - outerContent - discarded;
    if (effective >= innerContent - outerContent) return;

    hoist(tree, inner, sublist);
  });
}

/** The `listItem` that encloses `item`'s own list, if there is one. */
function findOuterItem(tree: Root, item: ListItem): ListItem | undefined {
  let found: ListItem | undefined;
  visit(tree, "listItem", (candidate: Node) => {
    for (const kid of (candidate as ListItem).children) {
      if (kid.type !== "list") continue;
      if ((kid as List).children.includes(item)) found = candidate as ListItem;
    }
  });
  return found;
}

/** Moves a sublist's items up to sit beside the item that held them. */
function hoist(tree: Root, inner: ListItem, sublist: List): void {
  visit(tree, "list", (candidate: Node) => {
    const host = candidate as List;
    const at = host.children.indexOf(inner);
    if (at === -1) return;

    const kidAt = inner.children.indexOf(sublist);
    if (kidAt === -1) return;
    inner.children.splice(kidAt, 1);
    host.children.splice(at + 1, 0, ...sublist.children);
    if (host.position?.end && sublist.position?.end) {
      host.position.end = { ...sublist.position.end };
    }
    if (inner.position?.end && sublist.position?.start) {
      inner.position.end = { ...sublist.position.start };
    }
  });
}
