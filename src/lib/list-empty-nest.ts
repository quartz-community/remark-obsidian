import type { List, ListItem, Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/** A marker at the head of its line, capturing the indent before it. */
const MARKER = /^([ \t]*)(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/u;

/** The indent before an item's marker, or undefined if its line has none. */
function markerIndent(source: string, item: ListItem): number | undefined {
  const from = item.position?.start?.offset;
  if (from === undefined) return undefined;
  const bol = source.lastIndexOf("\n", from - 1) + 1;
  const nl = source.indexOf("\n", from);
  const opener = MARKER.exec(source.slice(bol, nl === -1 ? undefined : nl));
  return opener ? opener[1]!.length : undefined;
}

/**
 * A blank line does not end an empty list item, and any indent after it nests.
 *
 * `-` / blank / `  -` / blank / `    foo` is one flat two-item list for us and nests the
 * second item under the first in Obsidian. CommonMark lets an item begin with at most one
 * blank line, so micromark ends the empty item there and reads the next marker as a
 * sibling; `remark-parse@8` keeps the item open.
 *
 * The threshold is **one column, not the content column**, which is the part worth
 * measuring: an empty item has no content to set a column against, so any indent at all
 * is inside it. Nine shapes from the legacy arbiter, four of which we already agree on
 * and which therefore bound the rule rather than merely permitting it:
 *
 *     -  / ''   / '  -' / '' / '    foo'  -> nested   (the case)
 *     -  / ''   / '  -' /      '    foo'  -> nested
 *     -  / ''   / '  -'                   -> nested
 *     -  / ''   / ' -'                    -> nested   (one space is enough)
 *     -  / ''   / '-'                     -> flat     (no indent, and we agree)
 *     -  / '  -' /       '    foo'        -> nested   (no blank, we agree)
 *     -  / '  -' / ''  / '    foo'        -> nested   (we agree)
 *     '- a' / '' / '  -' / '' / '    foo' -> nested   (non-empty first, we agree)
 *     -  / ''   / '  - foo'               -> nested
 *
 * The corpus itself cannot adjudicate this: exactly one case puts an empty item before a
 * more-indented sibling, and there are **no matching controls**, so the zero-regression
 * measurement on its own would prove nothing. The arbiter rows above are the evidence,
 * and the four agreeing shapes are what keep the condition from being too wide.
 *
 * Runs after `listEmptyItemTransform`, which has already absorbed any trailing block into
 * the sibling item, so this only has to move the item itself.
 */
export function listEmptyNestTransform(tree: Root, source: string): void {
  if (source === "") return;

  visit(tree, "list", (node: Node) => {
    const list = node as List;

    for (let index = list.children.length - 2; index >= 0; index--) {
      const empty = list.children[index];
      if (!empty || empty.children.length !== 0) continue;
      const base = markerIndent(source, empty);
      if (base === undefined) continue;

      // Every following item the empty one swallows: indented past its marker.
      let last = index;
      while (last + 1 < list.children.length) {
        const candidate = list.children[last + 1];
        if (!candidate) break;
        const indent = markerIndent(source, candidate);
        if (indent === undefined || indent <= base) break;
        last++;
      }
      if (last === index) continue;

      const moved = list.children.splice(index + 1, last - index);
      const first = moved[0];
      const final = moved[moved.length - 1];
      const nested: List = {
        type: "list",
        ordered: list.ordered,
        spread: false,
        children: moved,
        ...(first?.position?.start && final?.position?.end
          ? {
              position: {
                start: { ...first.position.start },
                end: { ...final.position.end },
              },
            }
          : {}),
      };
      if (list.ordered) nested.start = 1;

      empty.children.push(nested);
      if (empty.position && final?.position?.end) {
        empty.position.end = { ...final.position.end };
      }
    }
  });
}
