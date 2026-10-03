import type { Code, ListItem, Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

const OPENER = /^([`~]{3,})/;

/**
 * A fence opened inside a list item and never closed keeps consuming.
 *
 * CommonMark closes an unterminated fenced code block at the end of its
 * container, so `- ```` ``` ````⏎`  code`⏎`plain` ends the list item and starts a
 * paragraph. Obsidian's parser leaves the fence open and swallows the lazy line as
 * code, which matters beyond block shape: text inside a code block is literal, so
 * a `[^1]` there stays written rather than being read as a footnote reference.
 *
 * Only a sibling starting at column 1 is absorbed. An indented child belongs to
 * the list item on both parsers' reading, and taking it would corrupt ordinary
 * nested content; a lazy continuation is unindented by definition.
 */
function unterminated(slice: string): boolean {
  const opener = OPENER.exec(slice.trimStart());
  if (!opener) return false;

  const marker = opener[1]!;
  const lines = slice.split("\n");
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index]!.trim();
    if (
      line.length >= marker.length &&
      line === marker[0]!.repeat(line.length)
    ) {
      return false;
    }
  }
  return true;
}

export function fenceOutlivesTransform(tree: Root, source: string): void {
  visit(tree, "listItem", (node: Node) => {
    const item = node as ListItem;
    const children = item.children;

    for (let index = 0; index < children.length - 1; index++) {
      const fence = children[index]!;
      if (fence.type !== "code") continue;

      const start = fence.position?.start?.offset;
      const end = fence.position?.end?.offset;
      if (start === undefined || end === undefined) continue;
      if (!unterminated(source.slice(start, end))) continue;

      let last = index;
      while (
        last + 1 < children.length &&
        children[last + 1]!.position?.start?.column === 1
      ) {
        last++;
      }
      if (last === index) continue;

      const absorbedEnd = children[last]!.position?.end?.offset;
      if (absorbedEnd === undefined) continue;

      const block = fence as Code;
      block.value += source.slice(end, absorbedEnd);
      if (block.position && children[last]!.position?.end) {
        block.position.end = { ...children[last]!.position!.end };
      }
      children.splice(index + 1, last - index);
      break;
    }
  });
}
