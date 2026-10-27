import type { Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { bound, bracket, escaped, pairBefore } from "./brackets.js";

interface ParentNode extends Node {
  children: RootContent[];
}

/**
 * A `[[` straight after a bracket pair is no wikilink.
 *
 * Obsidian's parser reads `[x][…` as a reference whose label starts at the second `[`, so the
 * wikilink never forms: `a [x][[w]] b`, `![x][[w]]` and `a [][[w]] b` hold no link, defined
 * label or not, asked of 1.15.0. It still forms where that pair is no reference text of its own
 * -- after a footnote label `[^1]`, after the second half of `[x][]` or `[x][y]`, after a pair
 * holding another bracket (`[a [b] c]`), or after a literal or escaped `]`.
 *
 * Declining it leaves CommonMark's reading untouched -- `[x]` and `[[w]]` are text there --
 * so `strict` follows Obsidian. The wikilink goes back to the characters the author wrote.
 */
export function wikilinkAfterLabelTransform(tree: Root, source: string): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;
    const kids: RootContent[] = parent.children;

    const out: RootContent[] = [];
    let merging = false;
    kids.forEach((kid, index) => {
      const last = out[out.length - 1] as Text | undefined;
      const demoted =
        kid.type === ("wikilink" as string) &&
        afterLabel(kids, index, parent, source);
      if (last && (demoted || (merging && kid.type === "text"))) {
        const start = kid.position?.start.offset;
        const end = kid.position?.end.offset;
        last.value +=
          kid.type === "text" ? kid.value : source.slice(start ?? 0, end ?? 0);
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

/** Whether the wikilink at `index` opens right after a pair Obsidian reads as reference text. */
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
  if (source.slice(at, at + 2) !== "[[") return false;
  const close = at - 1;
  if (source[close] !== "]" || escaped(source, close)) return false;
  const floor =
    bound(kids, index - 2, -1, "end") ?? parent.position?.start.offset ?? 0;
  const open = pairBefore(source, close, floor);
  if (open === undefined || source[open + 1] === "^") return false;
  // The second half of `[x][]` or `[x][y]`: the reference already ended there.
  const second =
    open - 1 >= floor &&
    bracket(source, open - 1) === "]" &&
    pairBefore(source, open - 1, floor) !== undefined;
  return !second;
}
