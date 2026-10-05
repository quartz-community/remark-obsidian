import type { ListItem, Root, RootContent } from "mdast";
import { visit } from "unist-util-visit";

import { mapLines, shiftByMap } from "./line-map.js";

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

    const marker = TASK_MARKER.exec(source.slice(start, end));
    // Where the body really begins, which is what the re-parsed blocks have to
    // be placed at. Without this they kept the fragment's own numbering and
    // claimed the start of the document: `- [ ] 1.` nested a list at offset 0
    // when it belongs at 6, so anything editing by position wrote over the
    // task marker. `metadataCache` reports it at 6, which is how this surfaced.
    const base = start + (marker ? marker[0].length : 0);
    const map = mapLines(source, base, end, first.position!.start.line);
    const blocks = reparse(map.text).children as RootContent[];

    // A body that stays a single paragraph is where CommonMark and Obsidian
    // already agree, so leave the original nodes and their positions alone.
    if (blocks.length === 1 && blocks[0]?.type === "paragraph") return;

    for (const block of blocks) shiftByMap(block, map, 0);

    item.children = [
      ...(blocks as ListItem["children"]),
      ...item.children.slice(1),
    ];
  });
}
