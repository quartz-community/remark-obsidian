import type { PhrasingContent } from "mdast";
import { defaultHandlers, type Options } from "mdast-util-to-markdown";

type EmphasisHandle = typeof defaultHandlers.emphasis;

/** Whether `node` is written ending in a `*`: text that ends in one, or `*`-delimited attention. */
function endsInStar(node: PhrasingContent | undefined): boolean {
  if (!node) return false;
  if (node.type === "text") return node.value.endsWith("*");
  return node.type === "emphasis" || node.type === "strong";
}

/**
 * `legacy` only: an emphasis whose content ends in `*` is written with `_`.
 *
 * The writer pairs delimiters as CommonMark does, so it writes `*\\*em\\**`, which micromark
 * reads back as emphasis. remark-parse 8 does not: a `*` straight after an escaped one does not
 * close, and `_*em\\*_` came back from a format as the text `\\**em**` (found by
 * `fuzz/invariant-sweep.ts`). `_\\*em\\*_` reads the same under both. Only the order of the
 * markers changes, so where `_` cannot form the emphasis -- inside a word -- the writer's own
 * check still falls back to `*`.
 */
export function legacyEmphasisToMarkdown(): Options {
  const base = defaultHandlers.emphasis as EmphasisHandle;
  const emphasis = ((...args: Parameters<typeof base>) =>
    base(...args)) as EmphasisHandle;
  emphasis.peek = base.peek;
  emphasis.attention = (node, state) => {
    const result = base.attention(node, state);
    return endsInStar(node.children.at(-1))
      ? { ...result, markers: ["_", "*"] }
      : result;
  };
  return { handlers: { emphasis } };
}
