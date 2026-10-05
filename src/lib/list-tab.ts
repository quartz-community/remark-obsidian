import type { Code, List, ListItem, Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/**
 * A marker, the single whitespace that separates it, and then a tab.
 *
 * The second whitespace is what matters: `-\titem` spends its tab as the
 * separator, while `- \titem` has already spent a space and the tab is left to
 * indent.
 */
const LIST_TAB = /^[ \t]{0,3}(?:[-*+]|\d{1,9}[.)])[ \t]\t(.*)$/u;

/**
 * A tab after a list marker's separator indents, so the line is code.
 *
 * `remark-parse@8`'s list tokenizer consumes the marker and then a single
 * whitespace. A tab beyond that survives into the item's content and supplies a
 * full indent -- four columns, an indented code block -- so the construct behind
 * it is code to Obsidian whatever it looks like:
 *
 *     -\titem        -> paragraph, the tab is the separator
 *     - \titem       -> code
 *     1. \titem      -> code
 *     - \t[^1]: def  -> code, and so no definition
 *
 * The same shape as the quote-marker rule next door, and verified the same way:
 * against the legacy stack Obsidian parses with, `remark-parse@8` plus
 * `remark-footnotes@2`, which reports `listItem > code` for the last three and a
 * paragraph for the first.
 *
 * Only an item whose every content line carries the marker's indent is rewritten,
 * for the same reason the quote rule is cautious: a mixture would need the lines
 * regrouped, and guessing at that split is worse than recording the divergence.
 */
export function listTabTransform(tree: Root, source: string): void {
  if (source === "") return;

  visit(tree, "listItem", (node: Node) => {
    const item = node as ListItem;
    const from = node.position?.start?.offset;
    const to = node.position?.end?.offset;
    if (from === undefined || to === undefined) return;

    const lines = source.slice(from, to).split("\n");
    const opener = LIST_TAB.exec(lines[0] ?? "");
    if (!opener) return;
    // A single content line is the measured case. Beyond that the item's own
    // continuation indent competes with the tab's, which needs its own evidence.
    if (lines.length !== 1) return;

    const code: Code = {
      type: "code",
      lang: null,
      meta: null,
      value: opener[1]!,
      ...(node.position ? { position: node.position } : {}),
    };
    item.children = [code];
    item.spread = false;
    // A task marker cannot survive inside code, and the checkbox was never one:
    // `- \t[ ] x` is four columns of indent followed by text.
    item.checked = null;
  });

  // An item that holds only code holds no paragraph, so a list of them is not
  // loose however the blank lines fall.
  visit(tree, "list", (node: Node) => {
    const list = node as List;
    if (list.children.every((child) => child.children[0]?.type === "code")) {
      list.spread = false;
    }
  });
}
