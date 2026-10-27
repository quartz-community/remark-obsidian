import type { Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { balancedOpen, bound, bracket, escaped } from "./brackets.js";

interface ParentNode extends Node {
  children: RootContent[];
}

/**
 * A `[^x]` straight after a bracket pair is no footnote reference.
 *
 * Obsidian's parser reads `[text][^x]` as a full reference whose label is `^x`, so no footnote
 * reference forms, defined or not: `a [text][^9] b`, `a ![x][^9] b`, `a [][^9] b` and
 * `a [a [b] c][^9] b` hold none, asked of 1.15.0. Link text may hold balanced brackets, which
 * is where this differs from the wikilink rule. It still forms after a footnote label
 * (`[^8][^9]`), after the second half of `[x][]` or `[x][y]`, after a link, a space, a literal
 * `]` or an escaped one.
 *
 * Declining it leaves CommonMark's reading: `[text][^x]` is a full reference that nothing
 * defines as a link, so both brackets are text. Runs after the bare-reference passes, which
 * would otherwise read the reference back from that text.
 */
export function footnoteAfterLabelTransform(tree: Root, source: string): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;
    const kids: RootContent[] = parent.children;

    const out: RootContent[] = [];
    let merging = false;
    kids.forEach((kid, index) => {
      const last = out[out.length - 1] as Text | undefined;
      const demoted =
        kid.type === "footnoteReference" &&
        afterLabel(kids, index, parent, source);
      if (last && (demoted || (merging && kid.type === "text"))) {
        last.value +=
          kid.type === "text"
            ? kid.value
            : source.slice(
                kid.position?.start.offset ?? 0,
                kid.position?.end.offset ?? 0,
              );
        if (last.position && kid.position?.end) {
          last.position.end = { ...kid.position.end };
        }
        merging = demoted;
        return;
      }
      merging = false;
      out.push(kid);
    });
    if (out.length !== kids.length) parent.children = out;
  });
}

/** Whether the reference at `index` opens right after a pair Obsidian reads as link text. */
function afterLabel(
  kids: readonly RootContent[],
  index: number,
  parent: Partial<ParentNode>,
  source: string,
): boolean {
  const before = kids[index - 1];
  if (before?.type !== "text") return false;
  const at = kids[index]!.position?.start.offset;
  if (at === undefined || before.position?.end.offset !== at) return false;
  if (source.slice(at, at + 2) !== "[^") return false;
  const close = at - 1;
  if (source[close] !== "]" || escaped(source, close)) return false;
  const floor =
    bound(kids, index - 2, -1, "end") ?? parent.position?.start.offset ?? 0;
  const open = balancedOpen(source, close, floor);
  if (open === undefined || source[open + 1] === "^") return false;
  // The second half of `[x][]` or `[x][y]`: the reference already ended there.
  const second =
    open - 1 >= floor &&
    bracket(source, open - 1) === "]" &&
    balancedOpen(source, open - 1, floor) !== undefined;
  return !second;
}
