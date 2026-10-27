import type { Node } from "unist";

interface HastLike {
  type: string;
  value?: string;
  children?: HastLike[];
}

interface MathLike extends Node {
  value: string;
  data?: { hChildren?: HastLike[] };
}

/**
 * Set a `math` or `inlineMath` node's formula, and the HTML it renders to.
 *
 * `mdast-util-math` builds `data.hChildren` once, at parse time, from the value micromark read:
 * `pre > code > text` for a block, the text alone inline. `mdast-util-to-hast` renders from that
 * hint and never reads `value`, so a pass that rewrote `value` alone left a tree that looked
 * right and HTML that showed the old formula -- under `strict`, `1. Hello $$` / `   Math` /
 * `   $$` rendered an empty block, and `$$` / `Math$$` rendered `Math$$`. The formula is the
 * hint's one text leaf, so that leaf takes the new value.
 */
export function setMathValue(node: Node, value: string): void {
  const math = node as MathLike;
  math.value = value;
  const leaf = textLeaf(math.data?.hChildren);
  if (leaf) leaf.value = value;
}

function textLeaf(nodes: HastLike[] | undefined): HastLike | undefined {
  for (const node of nodes ?? []) {
    if (node.type === "text") return node;
    const inner = textLeaf(node.children);
    if (inner) return inner;
  }
  return undefined;
}
