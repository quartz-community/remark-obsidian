import type { Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface InlineMathNode extends Node {
  type: "inlineMath";
  value: string;
  data?: {
    display?: boolean;
    hName?: string;
    hProperties?: { className?: string[] };
    hChildren?: unknown[];
  };
}

/**
 * Obsidian treats any `$$`-delimited math as display, wherever it appears:
 * `$$E=mc^2$$`, `- $$x^2$$` and `# $$x^2$$` all render as display math inside the
 * surrounding block. `micromark-extension-math` classifies by position instead, so
 * a `$$` run inside a paragraph arrives as inline.
 *
 * The node stays inline, because Obsidian's own output is an inline element
 * carrying display styling (`<span class="math math-block">`) rather than a block.
 * Only the classification and the rendered class change.
 */
export function mathDisplayTransform(tree: Root, source: string): void {
  visit(tree, "inlineMath", (node: Node) => {
    const math = node as InlineMathNode;
    const start = math.position?.start?.offset;
    const end = math.position?.end?.offset;
    if (start === undefined || end === undefined) return;

    const opening = /^\$+/.exec(source.slice(start, end));
    if (!opening || opening[0].length < 2) return;

    math.data ??= {};
    math.data.display = true;
    math.data.hProperties ??= {};
    math.data.hProperties.className = ["language-math", "math-display"];
  });
}
