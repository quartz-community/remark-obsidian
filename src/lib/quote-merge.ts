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
      // A CALLOUT on the left counts as a quote, which `compose.mts --lazy` caught as 32 of
      // its cells: `> [!note] t` / `> # h` / `lazy` / `> after` is ONE `callout@0-3` in
      // Obsidian and was `callout` plus a separate `blockquote` here, because a callout line
      // arrives as its own node type and this test named only the other. Same rule, two node
      // types -- the third instance in this package, after the two `container-lazy.ts`
      // records.
      //
      // The merged node keeps the FIRST one's identity, which is what Obsidian reports for
      // every pair. All four combinations were probed:
      //
      //     quote   + quote     blockquote@0-3      already merged here
      //     callout + quote     callout@0-3         this change
      //     quote   + callout   blockquote@0-3      NOT done -- see below
      //     callout + callout   callout@0-3         NOT done -- see below
      //
      // The two with a callout on the RIGHT are left alone deliberately. Merging pushes the
      // second's children into the first, and a second callout brings a `calloutTitle` with
      // it -- so the result would claim two titles where Obsidian renders one callout whose
      // `[!tip] x` line is ordinary body text. Demoting that title back to text is a separate
      // question with no probe behind it yet, and neither shape is in the axis.
      const leftIsQuote =
        first?.type === "blockquote" || first?.type === "callout";
      if (!leftIsQuote || second?.type !== "blockquote") {
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
