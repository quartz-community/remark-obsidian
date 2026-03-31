import type { Root } from "mdast";
import { visit } from "unist-util-visit";

export function customTaskCharTransform(tree: Root, source?: string) {
  visit(tree, "listItem", (node: any) => {
    if (typeof node.checked === "boolean") {
      let char = node.checked ? "x" : " ";

      // Recover original character (e.g. "X" vs "x") from source
      if (source && node.position?.start?.offset != null) {
        const slice = source.slice(
          node.position.start.offset,
          node.position.start.offset + 20,
        );
        const m = slice.match(/\[([^\]])\]/);
        if (m) {
          char = m[1];
        }
      }

      node.data ??= {};
      node.data.taskChar = char;
      node.data.hProperties ??= {};
      node.data.hProperties.dataTaskChar = char;
      return;
    }

    const firstChild = node.children?.[0];
    if (!firstChild || firstChild.type !== "paragraph") return;

    const firstText = firstChild.children?.[0];
    if (!firstText || firstText.type !== "text") return;

    const match = firstText.value.match(/^\[([^\]])\]\s/);
    if (!match) return;

    const taskChar = match[1];

    node.checked = taskChar !== " ";
    node.data ??= {};
    node.data.taskChar = taskChar;
    node.data.hProperties ??= {};
    node.data.hProperties.dataTaskChar = taskChar;

    firstText.value = firstText.value.slice(match[0].length);

    if (firstText.value.length === 0) {
      firstChild.children.shift();
    } else if (
      firstText.position &&
      typeof firstText.position.start.offset === "number"
    ) {
      firstText.position.start.column += match[0].length;
      firstText.position.start.offset += match[0].length;
    }
  });
}
