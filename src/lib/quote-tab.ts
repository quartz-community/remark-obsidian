import type { Blockquote, Code, Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/** `>` with a tab straight after it, and whatever the tab indents. */
const QUOTE_TAB = /^[ \t]{0,3}>\t(.*)$/u;

/**
 * A tab after a quote marker indents, so the line is code.
 *
 * `remark-parse@8`'s blockquote tokenizer consumes the `>` and then at most one
 * **space**. A tab is not a space, so it survives into the quote's content and
 * supplies a full indent -- four columns, which is an indented code block. Every
 * construct behind such a marker is therefore code to Obsidian, not just a
 * footnote definition:
 *
 *     >\tplain text   -> code
 *     >\t# heading    -> code
 *     >\t- item       -> code
 *     >\t[^1]: def    -> code
 *
 * Verified against the legacy stack Obsidian parses with -- `remark-parse@8`
 * plus `remark-footnotes@2` -- which reports `blockquote > code` for all four,
 * and against a recorded answer for the definition: `>\t[^1]: def` is reported
 * with no definition at all.
 *
 * micromark admits a tab as the marker's own whitespace instead, so it reads
 * each line as the construct it looks like.
 *
 * Only a quote whose every content line is marked this way is rewritten. A
 * mixture would need the lines regrouped into alternating code and prose, and
 * guessing at that split is worse than leaving it recorded as a divergence.
 */
export function quoteTabTransform(tree: Root, source: string): void {
  if (source === "") return;

  visit(tree, "blockquote", (node: Node) => {
    const quote = node as Blockquote;
    const from = node.position?.start?.offset;
    const to = node.position?.end?.offset;
    if (from === undefined || to === undefined) return;

    const lines = source.slice(from, to).split("\n");
    const indented = lines.map((line) => QUOTE_TAB.exec(line));
    if (indented.some((match) => match === null)) return;

    const value = indented.map((match) => match![1]!).join("\n");
    const code: Code = {
      type: "code",
      lang: null,
      meta: null,
      value,
      ...(node.position ? { position: node.position } : {}),
    };
    quote.children = [code];
  });
}
