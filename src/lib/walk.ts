import type { Node } from "unist";

/** A node's children, or none. */
export const childrenOf = (node: Node): Node[] =>
  (node as { children?: Node[] }).children ?? [];

/**
 * Every node below `root` (not `root` itself), with its parent and its index there, in a
 * recursive pre-order walk's order: a parent before its children, siblings in order.
 *
 * Walked on an explicit stack. A tree nests as deep as the parser lets it, and a walk over all
 * of it -- including a comment's parsed body, which the writer never descends into -- spent a
 * frame or two per level and overflowed before anything else did.
 */
export function eachBelow(
  root: Node,
  visit: (node: Node, parent: Node, index: number) => void,
): void {
  const stack: Array<[Node, number]> = [[root, 0]];
  while (stack.length > 0) {
    const top = stack[stack.length - 1]!;
    const [parent, index] = top;
    const children = childrenOf(parent);
    if (index >= children.length) {
      stack.pop();
      continue;
    }
    top[1] = index + 1;
    const node = children[index]!;
    visit(node, parent, index);
    stack.push([node, 0]);
  }
}
