import type { ListItem, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { contentColumn } from "./definition-column.js";

interface ParentNode extends Node {
  children: RootContent[];
}

/**
 * A TAB past a LIST ITEM's content column is indented code, so the label does not define.
 *
 * The sibling of `definition-tab-after-quote.ts`, from the same 40 probes and the same
 * asymmetry -- five hosts crossed with eight indents:
 *
 *     item-blank   tab -/2   sp-tab 2/2   2sp-tab 2/2   3sp-tab 2/2   4sp -/-
 *     item-wide    tab -/3   sp-tab 3/3   2sp-tab 3/3   3sp-tab 3/3   4sp -/-
 *
 * Left digit Obsidian, right ours, `-` meaning no definition. A bare tab past the item's
 * content column defines nothing; one, two or three spaces then a tab all define. Scored
 * `better 21 / worse 7` for +4.
 *
 * THE COLUMN COMES FROM `contentColumn`, never re-derived. Six scored premises about that
 * quantity have been refuted by their own arithmetic rather than by the rule they tested, so
 * this file's standing rule is that anything reasoning about an item's content column calls
 * the same function the column pass does.
 *
 * RUN LATE, which is the whole reason this is a separate pass. Placed beside the quote half --
 * early, next to the comment and fence absorptions -- it is completely INERT: on the referee's
 * dense documents the definitions it would remove have not been created yet, or still sit
 * somewhere else. The scorer runs against the FINAL tree and measured +4 there, which is a
 * different question from "is this true where I run". So it belongs with the other passes that
 * settle a definition's extent, after everything that can create or move one.
 */
export function definitionTabPastItemTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;

  const lines = source.split("\n");
  const dead = new Set<number>();
  visit(tree, "listItem", (item: Node) => {
    const column = contentColumn(source, item as ListItem);
    if (column === undefined) return;
    visit(item, "footnoteDefinition", (node: Node) => {
      const line = node.position?.start?.line;
      if (line === undefined) return;
      const raw = lines[line - 1] ?? "";
      // Consume exactly the content column in COLUMNS, then look at what follows. A tab
      // advances to its stop, which is the whole point: the asymmetry being reproduced is
      // between a tab that starts the indent and one that follows a space.
      let at = 0;
      let seen = 0;
      while (at < raw.length && seen < column) {
        const character = raw[at];
        if (character === " ") seen += 1;
        else if (character === "\t") seen += 4 - (seen % 4);
        else break;
        at += 1;
      }
      if (raw[at] === "\t") dead.add(line - 1);
    });
  });
  if (dead.size === 0) return;

  prune(tree as unknown as ParentNode, dead);
}

/**
 * Found at ANY DEPTH, because lazy continuation pulls the definition into its container.
 *
 * A root-only scan is inert here, which is the first-version bug `quote-comment-lazy.ts`
 * records and which three passes this week have repeated.
 */
function prune(parent: ParentNode, dead: ReadonlySet<number>): void {
  const children = parent.children;
  if (!Array.isArray(children)) return;

  for (let index = children.length - 1; index >= 0; index--) {
    const child = children[index] as Node | undefined;
    if (!child) continue;
    prune(child as unknown as ParentNode, dead);
    if (child.type !== "footnoteDefinition") continue;
    const line = child.position?.start?.line;
    if (line !== undefined && dead.has(line - 1)) children.splice(index, 1);
  }
}
