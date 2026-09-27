import type { ListItem, Root, RootContent } from "mdast";
import { visit } from "unist-util-visit";

const TASK_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+\[.\]\s*/;

/**
 * Obsidian re-parses whatever follows a task marker as block markdown, so
 * `- [ ] 1.` nests an empty ordered list inside the task and `- [ ] > quote`
 * nests a blockquote. CommonMark keeps that text inline.
 *
 * Reparsing is the only faithful reproduction: the construct is decided by a
 * second block-level pass, not by anything the inline tokenizer can observe.
 */
export function taskReparseTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  visit(tree, "listItem", (item: ListItem) => {
    if (item.checked === null || item.checked === undefined) return;

    const [first] = item.children;
    if (!first || first.type !== "paragraph") return;

    const start = first.position?.start?.offset;
    const end = first.position?.end?.offset;
    if (start === undefined || end === undefined) return;

    const body = source.slice(start, end).replace(TASK_MARKER, "");
    const blocks = reparse(body).children as RootContent[];

    // A body that stays a single paragraph is where CommonMark and Obsidian
    // already agree, so leave the original nodes and their positions alone.
    if (blocks.length === 1 && blocks[0]?.type === "paragraph") return;

    item.children = [
      ...(blocks as ListItem["children"]),
      ...item.children.slice(1),
    ];
  });
}
