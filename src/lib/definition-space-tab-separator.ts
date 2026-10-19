import type { Root, RootContent } from "mdast";
import type { Node } from "unist";

/** A marker whose separator is one or more SPACES and then a tab. */
const SPACE_THEN_TAB = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ ]+\t/u;

/**
 * A label whose marker separator is SPACES then a tab is not a definition.
 *
 * From the `tab-sequence-separator` grid, whose eighteen cells diverge in six places and split
 * cleanly by direction across three marker shapes:
 *
 *     separator      obs     ours
 *     tab            col 5   col 5    agree
 *     tab 2sp        col 5   col 5    agree
 *     tab 2sp tab    col 5   NONE     a separate rule, the other direction
 *     tab tab        none    none     agree
 *     2sp tab        NONE    col 5    this rule
 *     2sp            col 6   col 6    agree
 *
 * `*⟨2sp⟩[^1]:` defines and `*⟨2sp⟩⇥[^1]:` does not, so the trailing tab is what kills it, and
 * the two agreeing rows either side are what make it the tab rather than the width.
 *
 * It is the tab-after-space asymmetry seen from the THRESHOLD side. This package already
 * measures that a tab after a space contributes nothing to a content column -- the rule lives
 * in `quote-indented-code.ts`, in one of seven column helpers, deliberately. What this adds is
 * that the same tab still reaches its STOP for the indented-code threshold, which puts the
 * label at four columns and makes it literal. One tab, two answers, depending on which
 * question is being asked.
 *
 * `score.mts` scored it `better 12 / worse 0 / same 0` for +9 agreeing documents before any of
 * this was built -- the only candidate this session with no losses at all. `sp+tab` separators
 * are 100 referee documents with 27 diverging, so the population is real rather than
 * grid-sized.
 */
export function definitionSpaceTabSeparatorTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;

  const lines = source.split("\n");
  const dead = new Set<number>();
  for (let line = 0; line < lines.length; line++) {
    if (SPACE_THEN_TAB.test(lines[line] ?? "")) dead.add(line + 1);
  }
  if (dead.size === 0) return;

  // Found at ANY DEPTH, because lazy continuation and the item itself both nest a definition
  // below the root -- the root-only scan that left two earlier passes here completely inert.
  remove(tree as unknown as ParentNode, dead);
}

interface ParentNode extends Node {
  children: RootContent[];
}

function remove(parent: ParentNode, dead: ReadonlySet<number>): void {
  const children = parent.children;
  if (!Array.isArray(children)) return;
  for (let index = children.length - 1; index >= 0; index--) {
    const child = children[index] as Node | undefined;
    if (!child) continue;
    remove(child as unknown as ParentNode, dead);
    if (child.type !== "footnoteDefinition") continue;
    const at = child.position?.start?.line;
    if (at !== undefined && dead.has(at)) children.splice(index, 1);
  }
}
