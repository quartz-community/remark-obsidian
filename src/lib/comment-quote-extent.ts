import type { Blockquote, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

const MARKER = "%%";
const QUOTE_PREFIX = /^[ \t]*>[ \t]?/u;

interface CommentNode extends Node {
  type: "comment";
  value: string;
  children?: RootContent[];
}

/**
 * `comment` is this package's own node and is not in mdast's block-content
 * union, so narrowing a quote's child to it intersects to `never` even though
 * the tokenizer puts one there. Typed `unknown` for the same reason
 * `comment-in-definition.ts` is.
 */
const isComment = (node: unknown): node is CommentNode =>
  (node as { type?: string } | undefined)?.type === "comment";

/**
 * An unclosed `%%` inside a quote swallows the rest of that quote.
 *
 * The same rule the top level already follows -- an opener with no closer runs
 * to the end of what contains it -- but the quote's own lazy continuation makes
 * one case look different. `> %%` followed by a line *without* a marker pulls
 * that line into the quote, and the comment has to take it:
 *
 *     > %%            one blockquote, and the comment holds `[^1]: def`,
 *     [^1]: def       so nothing is defined
 *
 *     > %%            the blank line ends the quote, and the definition
 *                     below it is live
 *     [^1]: def
 *
 * Recorded against Obsidian 1.14.4 rather than reasoned, because `%%` is its own
 * construct and the legacy stack cannot arbitrate it: the first reports one
 * `blockquote` section spanning both lines and no definition, the second reports
 * a `blockquote` and a `footnoteDefinition`.
 *
 * `> %%` / `> [^1]: def` already worked, since the marked line is plainly the
 * quote's content; only the unmarked continuation needed this.
 */
export function commentQuoteExtentTransform(tree: Root, source: string): void {
  if (source === "") return;

  visit(tree, "blockquote", (node: Node) => {
    const quote = node as Blockquote;
    const quoteEnd = node.position?.end?.offset;
    if (quoteEnd === undefined) return;

    const index = quote.children.findIndex((child) => isComment(child));
    if (index === -1 || index === quote.children.length - 1) return;

    const comment = quote.children[index] as unknown as CommentNode;
    const from = comment.position?.start?.offset;
    if (from === undefined) return;

    // Only an unclosed comment, judged on the comment's *own* extent rather
    // than on the rest of the quote. A comment may close part-way and leave
    // content behind it -- `> %%` / `> [^1]: dead %%` / `> tail` closes on the
    // second line and Obsidian shows `tail` -- so measuring to the quote's end
    // reads every such comment as unclosed and swallows what it should not.
    // Closed means a *second* `%%` after the opener. Testing whether the span
    // ends with one reads an unclosed comment as closed, because the opener is
    // then the last thing in it.
    const ownEnd = comment.position?.end?.offset;
    if (ownEnd === undefined) return;
    const own = source.slice(from, ownEnd);
    if (own.slice(MARKER.length).includes(MARKER)) return;

    comment.value = source
      .slice(from + MARKER.length, quoteEnd)
      .split("\n")
      .map((line, offset) =>
        offset === 0 ? line : line.replace(QUOTE_PREFIX, ""),
      )
      .join("\n");
    if (comment.position) {
      comment.position.end = { ...node.position!.end };
    }
    // The body is reachable through the comment's own children, which
    // `commentParseTransform` fills in later from the span set here.
    delete comment.children;
    quote.children = quote.children.slice(0, index + 1);
  });
}
