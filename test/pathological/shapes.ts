/**
 * Inputs that have made real Markdown parsers degrade, taken from cmark's
 * `test/pathological_tests.py` and the issues behind it, at the sizes those
 * reported. They are kept here rather than in the parity corpus because they
 * are measured for *time*, not for agreement with Obsidian — rendering a
 * 25,000-deep blockquote inside the recorder would prove nothing and cost
 * minutes.
 *
 * Sizes are the published ones divided where a pure-JS parser is expected to
 * be slower than cmark's C, but kept large enough that a quadratic path blows
 * the budget while a linear one does not.
 */
export const SHAPES: Readonly<Record<string, (n: number) => string>> = {
  /** cmark: `"[" * 25000 + "a" + "]" * 25000`. */
  "nested-brackets": (n) => "[".repeat(n) + "a" + "]".repeat(n),
  /** cmark: nested blockquotes, 25,000 deep. */
  "nested-blockquotes": (n) => "> ".repeat(n) + "a",
  /** cmark: deeply nested lists, 500 levels. */
  "nested-lists": (n) =>
    Array.from({ length: n }, (_, i) => `${" ".repeat(i)}- a`).join("\n"),
  /** cmark: unclosed links, 30,000 repetitions. */
  "unclosed-links": (n) => "[a](<b".repeat(n),
  /** cmark: unclosed HTML comments, 300,000 repetitions. */
  "unclosed-comment": (n) => "<!--".repeat(n),
  /** cmark: a long emphasis delimiter run. */
  "delimiter-run": (n) => "*".repeat(n) + "a" + "*".repeat(n),
  /** cmark #373: quadratic inline parsing, `"- " * N + "s" + " -" * N`. */
  "list-dash-sandwich": (n) => "- ".repeat(n) + "s" + " -".repeat(n),
  /** cmark #299: quadratic inline HTML, `"a <![CDATA[" * N`. */
  "cdata-repeat": (n) => "a <![CDATA[".repeat(n),

  // The same shapes aimed at this package's own constructs, which cmark has
  // no equivalent of and which carry most of our hand-written regexes.
  "wikilink-open": (n) => "[[".repeat(n) + "a",
  "highlight-run": (n) => "=".repeat(n) + "a" + "=".repeat(n),
  "comment-open": (n) => "%%".repeat(n),
  "math-open": (n) => "$".repeat(n) + "a",
  "inline-footnote-open": (n) => "^[".repeat(n) + "a",
  "callout-nest": (n) => "> ".repeat(n) + "[!note] t",
  "tag-run": (n) => "#a/".repeat(n),
  "table-pipes": (n) => `|${"a|".repeat(n)}\n|${"-|".repeat(n)}\n`,
  "footnote-refs": (n) => "[^a]".repeat(n),
  "block-ref-run": (n) => "a ^b\n".repeat(n),
};

export type ShapeName = keyof typeof SHAPES;
