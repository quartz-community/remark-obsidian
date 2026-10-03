import type { Root, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

const REFERENCE = /\[\^([^[\]\s]+)\]/g;

/**
 * Obsidian consumes a footnote reference's delimiters even when nothing defines it,
 * so `see [^x]` renders as `see x`. GFM instead needs a matching definition and
 * leaves an unmatched reference as literal text, which is where we diverged.
 *
 * Only `text` nodes are rewritten, which is what keeps this honest: a reference
 * that GFM *did* resolve is already a `footnoteReference` node, and one inside a
 * code span or fence is `inlineCode`/`code`. So any `[^name]` still sitting in a
 * text node is by construction unresolved, and no separate definition lookup is
 * needed.
 */
export function bareFootnoteRefTransform(tree: Root): void {
  visit(tree, "text", (node: Node) => {
    const text = node as Text;
    if (!text.value.includes("[^")) return;
    text.value = text.value.replace(REFERENCE, "$1");
  });
}
