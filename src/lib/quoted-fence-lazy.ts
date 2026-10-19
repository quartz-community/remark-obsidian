import type { Root, RootContent } from "mdast";
import type { Node } from "unist";

/**
 * Every opener that swallows the unquoted line below it, measured rather than assumed.
 *
 * A 32-cell grid -- eight openers against four hosts -- says which ones do. `D` is a
 * definition Obsidian reports:
 *
 *                 ```   ~~~    $$   <div>  <!--   %%    # h   plain
 *     quote d1      -     -     -    X-/D  X-/D    -      D      -
 *     quote d2   X-/D  X-/D  X-/D    X-/D  X-/D    -      D      -
 *     item -        -     -     -    X-/D  X-/D    -      D      -
 *     item +        -     -     -    X-/D  X-/D    -      D      -
 *
 * So a fence, a `$$` and an HTML opener all swallow; a `%%` and a plain line already agree by
 * other means, and a HEADING does not swallow at all -- it is the negative that bounds the
 * set, since a heading ends the container rather than running past it.
 */
const OPENER = /^ {0,3}(?:```|~~~|\$\$|<[A-Za-z!/])/u;
/** A RUN of quote markers, not one. `> > ``` ` is depth two and was not detected at all. */
const QUOTE_RUN = /^[ \t]*(?:>[ \t]?)+/u;
const QUOTED = /^[ \t]*>/u;
/**
 * THE MARKER HOST IS REFUSED, and the number is why.
 *
 * `- <div>` / `[^1]:` and `+ <!--` / `[^x-y]:` suppress the definition in Obsidian exactly
 * as the quoted forms do -- the grid's bottom two rows -- and admitting them here closes all
 * four remaining cells. It also costs 44 REFEREE DOCUMENTS, 5912 down to 5868.
 *
 * So the shape is real and the rule over-fires on it. A quote's content is bounded by its own
 * marker on every line, so `not quoted` means `outside the quote`; an item's is bounded by
 * indentation this line scan cannot see, so `not marked` means almost every line in the
 * document. The quote half is a line-local question and the item half is not.
 *
 * A probe table proves what Obsidian does to a SHAPE and cannot prove how often that shape is
 * what a real document contains. Sixth instance of that note in this harness.
 */

/**
 * An UNQUOTED definition below a quoted fence opener is inside the fence, so it does not define.
 *
 * Two live shrinks converge on this. The `ref-extra` family's largest clean cluster is 24
 * quoted fences, and the `def-extra` family's is 20 more whose minimal forms are two lines:
 *
 *     ">```\n[^2]:"      "> ```\n[^a]:"      "> > ```\n[^ä]:"
 *
 * 25 probes give the rule, five openers crossed with five tails, with two controls that make it
 * LAZY CONTINUATION into a quoted fence rather than a fact about fences: a QUOTED line below
 * the opener already agrees, and a BLANK line before the unquoted one ends the quote so the
 * content is live again.
 *
 * ONLY `footnoteDefinition` IS REMOVED, which is measured rather than tidy. Deleting every root
 * child those lines produced costs referee 5803 -> 5800 and code 742 -> 738, because the lines
 * stop contributing their code RANGE as well as their facts. A definition is the one node whose
 * removal is exactly the observable: Obsidian reports no definition there, and -- unlike a
 * commented one -- does not index its label as a reference either, which this file records
 * separately for fences.
 */
export function quotedFenceLazyTransform(tree: Root, source: string): void {
  if (source === "") return;

  const lines = source.split("\n");
  const swallowed = new Set<number>();
  let open = false;
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at] ?? "";
    const quoted = QUOTED.test(line);
    if (quoted && OPENER.test(line.replace(QUOTE_RUN, ""))) {
      open = !open;
      continue;
    }
    if (!open) continue;
    // A blank line ends the quote, and the lazy continuation with it.
    if (line.trim() === "") {
      open = false;
      continue;
    }
    if (!quoted) swallowed.add(at);
  }
  if (swallowed.size === 0) return;

  // Found at ANY DEPTH, because lazy continuation has already pulled the definition into the
  // quote: `>```` / `[^2]: def` arrives as `blockquote > [ code, footnoteDefinition ]`, so the
  // definition is the fence's SIBLING and not a root child. A root-only scan finds nothing and
  // the first version of this pass was completely inert -- referee and code both unmoved --
  // which is the same mistake `quote-comment-lazy.ts` records from its own first version.
  remove(tree as unknown as ParentNode, swallowed);
}

interface ParentNode extends Node {
  children: RootContent[];
}

function remove(parent: ParentNode, swallowed: ReadonlySet<number>): void {
  const children = parent.children;
  if (!Array.isArray(children)) return;
  for (let index = children.length - 1; index >= 0; index--) {
    const child = children[index] as Node | undefined;
    if (!child) continue;
    remove(child as unknown as ParentNode, swallowed);
    if (child.type !== "footnoteDefinition") continue;
    const from = child.position?.start?.line;
    const to = child.position?.end?.line;
    if (from === undefined || to === undefined) continue;
    let covered = true;
    for (let line = from - 1; line <= to - 1; line++) {
      if (!swallowed.has(line)) {
        covered = false;
        break;
      }
    }
    if (covered) children.splice(index, 1);
  }
}
