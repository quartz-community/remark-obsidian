import type { Root, RootContent } from "mdast";
import type { Node } from "unist";

/** A run of quote markers, each consuming at most one following space. */
const QUOTE_PREFIX = /^[ \t]*(?:>[ \t]?)*/u;

interface ParentNode extends Node {
  children: RootContent[];
}

/**
 * A TAB directly after a quote's prefix is indented code, so the label does not define.
 *
 * `referee-shrink --live` on the 80 one-away `def-extra` documents put `> ⇥[^1]:` among its
 * commonest minimal forms at nine documents. 40 probes -- five hosts crossed with eight
 * indents -- give the rule and its controls:
 *
 *     host            tab    sp-tab  2sp-tab  3sp-tab  4sp   2sp
 *     quote-inline    -/2    2/2     2/2      2/-      -/-   2/2
 *     item-blank      -/2    2/2     2/2      2/2      -/-   2/2
 *     item-wide       -/3    3/3     3/3      3/3      -/-   3/3
 *
 * Left digit Obsidian, right ours, `-` meaning no definition. A BARE TAB past the prefix
 * defines nothing; one, two or three spaces then a tab all define; four spaces defines nothing
 * on both sides already. So this is the leading-tab-versus-tab-after-space asymmetry this
 * package already encodes at line start, measured relative to the CONTAINER's content column
 * instead -- and the five agreeing indent columns are what make it that rule rather than a
 * fact about tabs.
 *
 * SCOPED TO THE QUOTE PREFIX, which is where it was measured and scored: `better 13 / worse 0`
 * for +11 referee documents. The item-hosted sibling in the same shrink -- `- p` / `⟨2sp⟩⇥[^1]:`
 * at twenty documents -- is NOT covered here, because an item's content indent is not a prefix
 * this can strip without re-deriving the content column, which is a quantity six scored
 * premises have been refuted about. It is left for a rule that computes it from the tree.
 *
 * Found at ANY DEPTH. Lazy continuation pulls the definition into the quote, so it arrives as
 * the quote's own child rather than a root one -- a root-only scan is inert, which is the
 * first-version bug `quote-comment-lazy.ts` records and two passes this session have repeated.
 */
export function definitionTabAfterQuoteTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;
  const lines = source.split("\n");
  prune(tree as unknown as ParentNode, lines);
}

function prune(parent: ParentNode, lines: readonly string[]): void {
  const children = parent.children;
  if (!Array.isArray(children)) return;

  for (let index = children.length - 1; index >= 0; index--) {
    const child = children[index] as Node | undefined;
    if (!child) continue;
    prune(child as unknown as ParentNode, lines);
    if (child.type !== "footnoteDefinition") continue;
    const line = child.position?.start?.line;
    if (line === undefined) continue;
    const rest = (lines[line - 1] ?? "").replace(QUOTE_PREFIX, "");
    // Only where a quote prefix was actually consumed: at root the same shape is `⇥[^1]:`,
    // which both sides already read as code, and claiming it here would be a second rule
    // wearing this one's measurements.
    if (rest === (lines[line - 1] ?? "")) continue;
    if (!rest.startsWith("\t")) continue;
    children.splice(index, 1);
  }
}
