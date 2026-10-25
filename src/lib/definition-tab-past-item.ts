import type { ListItem, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { contentColumn } from "./definition-column.js";

interface ParentNode extends Node {
  children: RootContent[];
}

const TAB_LED = /^\t/u;
const NESTED_MARKER = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]/u;

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
 *
 * IT DOES NOT APPLY WHEN A NESTED MARKER OPENS THE LINE, and the indent's shape is what
 * draws that line. `- a` / `    - b` / `\t\t- [^1]: def` has the definition inside the item
 * the `- ` on its own line opens, not inside the outer one -- but this pass visits EVERY
 * ancestor item, and the outer item's content column of 2 is overshot by a single tab
 * advancing to column 4, after which the character tested is the second tab and the label
 * is pruned. Stock gets this right; we were destroying it, and taking the item's content
 * with it: a `listItem` left with no children at all.
 *
 * The exclusion is bounded to a TAB-LED indent, which is B2's own asymmetry -- "a tab in
 * the indentation is consumed whole, so `\t` and `\t  ` count as inside the `- ` item, and
 * `  \t` as code":
 *
 *     \t\t- [^1]: def     obs DEFINES at col 4      tab-led
 *     \t\t* [^1]: def     obs DEFINES at col 4      tab-led
 *       \t* [^1]: def     obs defines NOTHING       space-led, so code
 *
 * Without that bound the exclusion is 2 gain / 2 break, because the two space-led
 * documents are exactly the case this pass must keep pruning. With it, 2 / 0.
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
      if (TAB_LED.test(raw) && NESTED_MARKER.test(raw.slice(at))) return;
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
