import type { Paragraph, Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import type { Comment } from "./types.js";

interface ParentNode extends Node {
  children: Node[];
}

const spansLines = (node: Node): boolean =>
  (node.position?.end?.line ?? 0) > (node.position?.start?.line ?? 0);

/**
 * Lift a multi-line `%%` comment out of the paragraph that swallowed it.
 *
 * Obsidian reports a block comment as its own section, even when its closing `%%`
 * sits mid-line and the rest of that line continues as a paragraph:
 * `%%\nline %% nested %% line` is a comment, then a paragraph. A flow construct
 * in micromark owns whole lines and cannot stop mid-line, so the comment is
 * tokenized inline and ends up as the paragraph's first child instead.
 *
 * Hoisting restores the block split without rewriting the source, so positions
 * stay true to the document the author wrote. Only a comment that spans lines
 * moves: a single-line `%%note%% tail` is inline in Obsidian too.
 */
export function commentHoistTransform(tree: Root): void {
  visit(tree, "paragraph", (node: Node, index, parent) => {
    if (!parent || typeof index !== "number") return;

    const paragraph = node as Paragraph;
    const lead = paragraph.children[0] as Node | undefined;
    if (!lead || lead.type !== "comment" || !spansLines(lead)) return;
    if (lead.position?.start?.offset !== paragraph.position?.start?.offset) {
      return;
    }

    paragraph.children.shift();

    // The paragraph now starts where the comment ended, or the source slice taken
    // from its position would still cover the comment.
    if (paragraph.position && lead.position?.end) {
      paragraph.position.start = { ...lead.position.end };
    }

    const siblings = (parent as ParentNode).children;
    const remaining = paragraph.children.length > 0;
    siblings.splice(index, remaining ? 0 : 1, lead as Comment);
    return index + (remaining ? 2 : 1);
  });
}
