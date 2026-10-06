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
  /**
   * `<` is common enough that an unbounded lookahead from it is ruinous: the
   * first draft of `legacy-autolink.ts` scanned to end of chunk and took 16.2s
   * here against 64ms bare, a 254x slowdown.
   *
   * Worth recording that this gate would have *passed* it -- 16.2s is inside the
   * 20s budget. The budget catches a hang, not a quadratic, so the construct
   * bounds its own scan and `legacy-autolink.ts` records the ratio.
   */
  "autolink-open": (n) => "<".repeat(n),
  /** The same construct on input it actually claims, backslash and all. */
  "autolink-email": (n) => "<a\\b@c.test>".repeat(n),
  /**
   * Two shapes that look like a backtick baseline and measure nothing. A single
   * run has nothing to rescan, and runs that are all width 2 let every opener
   * find its own width immediately -- so both are fast for reasons that have
   * nothing to do with the pathology. Kept as controls, honestly labelled.
   */
  "backtick-run": (n) => "`".repeat(n),
  "backtick-retry": (n) => "``a".repeat(n),
  /**
   * cmark's real backtick case, and the one that bites: widths that *increase*,
   * so no opener ever finds its own width ahead and each scans to EOF and fails.
   * Stock micromark is superlinear here, roughly bytes^1.5 -- 2.1s at 125KB and
   * **132s at 2MB**.
   *
   * `legacy-code-text.ts` settles those openers from a cached run index instead,
   * so stock never runs the scan it would fail:
   *
   *       n     bytes      bare      ours
   *     250    31,625     283ms      17ms
   *     500   125,750   2,084ms      44ms
   *    1000   501,500  16,219ms     155ms
   *    2000 2,003,000 130,322ms     620ms
   *
   * Ours grows x4 per doubling of `n`, which is exactly how the bytes grow -- so
   * linear where stock is not, and 210x faster at the top of that table.
   *
   * Gated at n=2000 *because* ours is fast there. Losing the index would put this
   * back at 132s against a 20s budget, so the guard fails loudly instead of
   * drifting.
   */
  "backtick-increasing": (n) =>
    Array.from({ length: n }, (_, i) => "`".repeat(i + 1) + "a").join(""),
};

export type ShapeName = keyof typeof SHAPES;
