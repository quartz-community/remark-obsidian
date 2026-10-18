import type { Root, RootContent } from "mdast";
import type { Node } from "unist";

const FENCE = /^ {0,3}(?:```|~~~)/u;
const QUOTED = /^[ \t]*>/u;

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
    if (quoted && FENCE.test(line.replace(/^[ \t]*>[ \t]?/u, ""))) {
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
