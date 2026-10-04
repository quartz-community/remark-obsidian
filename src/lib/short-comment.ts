import type { Paragraph, Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface ParentNode extends Node {
  children: RootContent[];
}

const SHORT = /^<!--(?:-)?>$/;

/**
 * `<!-->` and `<!--->` are not comments to Obsidian.
 *
 * CommonMark 0.30 added them as the two empty-comment short forms, and micromark
 * implements that, so they parse as HTML and render as nothing. Obsidian's parser
 * predates the change and shows them as text, which is a visible difference rather
 * than a structural one: the characters appear in the note.
 */
export function shortCommentTransform(tree: Root): void {
  visit(tree, "html", (node: Node, index, parent) => {
    const html = node as unknown as { value: string };
    if (!SHORT.test(html.value)) return;
    if (!parent || typeof index !== "number") return;

    const host = parent as unknown as ParentNode;
    const text: Text = { type: "text", value: html.value };
    if (node.position) text.position = node.position;

    const inline = host.type !== "root" && host.type !== "blockquote";
    const replacement: RootContent = inline
      ? text
      : ({
          type: "paragraph",
          children: [text],
          position: node.position,
        } as Paragraph);

    host.children.splice(index, 1, replacement);
  });
}
