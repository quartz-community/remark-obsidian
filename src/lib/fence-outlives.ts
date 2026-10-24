import type { Code, ListItem, Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

// AT MOST THREE SPACES, because the indentation IS the signal here. A `code` node's slice is
// relative to its container, so inside `- p` an opener written at six columns arrives as
// `    ~~~` -- four, which is indented code and no fence at all. Trimming the slice first made
// every indented-code block look like an unterminated fence, and this pass then swallowed the
// lines after it:
//
//     - p / blank / ⟨6sp⟩~~~ / lazy / [^1]: def / ⟨6sp⟩~~~
//
// Obsidian reads `lazy` and the label as one paragraph and indexes `[^1]` as a bare reference
// at column 0; we produced one code node covering both and indexed nothing. A leading tab is
// four columns, so it correctly fails this test too.
const OPENER = /^ {0,3}([`~]{3,})/;

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
  const opener = OPENER.exec(slice);
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
