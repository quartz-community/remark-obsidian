import type { Paragraph, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/**
 * Two paragraphs with a single newline between them are one paragraph.
 *
 * No parse produces that: a blank line is what separates paragraphs, so the
 * shape only appears where a transform has rebuilt one block and left the next
 * beside it. Folding a definition whose body spans several blocks does exactly
 * that — the fold reaches the fence line and the lazy line below it stays
 * behind as a second paragraph.
 *
 * Rejoining them is safe for the same reason it is needed: the state is not
 * reachable from the parser, so nothing legitimate is being merged.
 */
export function paragraphMergeTransform(tree: Root, source: string): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length - 1; index++) {
      const first = parent.children[index];
      const second = parent.children[index + 1];
      if (first?.type !== "paragraph" || second?.type !== "paragraph") continue;

      const end = first.position?.end?.offset;
      const start = second.position?.start?.offset;
      if (end === undefined || start === undefined) continue;
      if (source.slice(end, start) !== "\n") continue;

      (first as Paragraph).children.push(
        { type: "break" },
        ...(second as Paragraph).children,
      );
      if (first.position && second.position?.end) {
        first.position.end = { ...second.position.end };
      }
      parent.children.splice(index + 1, 1);
      index--;
    }
  });
}
