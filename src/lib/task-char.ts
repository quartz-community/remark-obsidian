import type { Root } from "mdast";
import { visit } from "unist-util-visit";

export function customTaskCharTransform(tree: Root) {
  visit(tree, "listItem", (node: any) => {
    if (typeof node.checked === "boolean") {
      const char = node.checked ? "x" : " ";
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
