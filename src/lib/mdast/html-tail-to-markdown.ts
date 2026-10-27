import type { Options } from "mdast-util-to-markdown";
import type { Html } from "mdast";

/**
 * An html block is written without its trailing line endings.
 *
 * Stock's handler is `return node.value || ''`, and micromark gives an *unclosed* html
 * block a span that runs through the line ending after it -- so the value ends `\n`
 * while the block separator writes one too. Written raw, the two are added together,
 * and because the comment is unclosed it re-absorbs the surplus on the next parse:
 *
 *     [^9]: x
 *         <!--
 *     [^1]: one
 *     -->
 *
 * gains two line endings per format pass, forever. Reproduced on bare
 * `remark-parse` + `remark-gfm` + `remark-stringify` with none of this package
 * loaded, so the defect is upstream and this is a guard rather than a repair of our
 * own output; the report is held with the others.
 *
 * Only the *trailing* endings go. An html value's interior line endings are its
 * content, and a node whose value is entirely line endings keeps one so the block does
 * not vanish.
 *
 * Counted rather than matched: the ReDoS lint reads a trailing-anchored `\n+$` as a
 * second-degree polynomial, and a loop is the substitution it accepts.
 */
export function htmlTailToMarkdown(): Options {
  return {
    handlers: {
      html(node: Html) {
        const value = node.value || "";
        let end = value.length;
        while (end > 0 && value[end - 1] === "\n") end -= 1;
        return end === 0 ? value : value.slice(0, end);
      },
    },
  };
}
