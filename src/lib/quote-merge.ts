import type { Blockquote, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/**
 * Two quotes with nothing between them are one quote.
 *
 * A column-zero line inside a quote is lazy continuation, and the `>` line
 * after it carries on the same quote — `> closing words` / `[^9]: orphan` /
 * `> ---` is a single blockquote. A definition-shaped continuation line breaks
 * that here: it ends the quote as a block of its own, and the `>` line below
 * then opens a second one. Absorbing the continuation puts the text back in
 * the right place but leaves the two quotes side by side.
 *
 * Only an immediately adjacent pair is merged. A blank line between them
 * really does start a new quote, on either reading.
 */
export function quoteMergeTransform(tree: Root, source: string): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length - 1; index++) {
      const first = parent.children[index];
      const second = parent.children[index + 1];
      if (first?.type !== "blockquote" || second?.type !== "blockquote") {
        continue;
      }

      const end = first.position?.end?.offset;
      const start = second.position?.start?.offset;
      if (end === undefined || start === undefined) continue;
      if (source.slice(end, start) !== "\n") continue;

      (first as Blockquote).children.push(
        ...(second.children as Blockquote["children"]),
      );
      if (first.position && second.position?.end) {
        first.position.end = { ...second.position.end };
      }
      parent.children.splice(index + 1, 1);
      index--;
    }
  });
}
