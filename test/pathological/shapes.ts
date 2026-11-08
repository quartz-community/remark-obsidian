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
  /** cmark: deeply nested lists, 500 levels, two spaces per level. One space nests nothing. */
  "nested-lists": (n) =>
    Array.from({ length: n }, (_, i) => `${"  ".repeat(i)}- a`).join("\n"),
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
  /**
   * A `==` straight after whitespace closes nothing, so the scan carries on past it, and every
   * opener read to the end of the run, testing all it had read at each `==`. `highlight-space-run`
   * is gated where each half of the fix is what holds it: without the closer table `legacy` takes
   * 2.6 s at 8,000, 30 s at 32,000, and 121 s at 64,000, and without the memo `strict` takes 72 s
   * at 16,000.
   *
   * `highlight-newline-run` doesn't hold the memo: at 8,000 without it, `strict` took 18 to 26 s,
   * either side of the budget. Nor can it go much higher, whatever the scan does. Under `strict`
   * this shape stays superlinear in micromark's `resolveAllText`, which splices once per merged
   * run of `data` (10.9 s of a 12.2 s parse at 32,000), and `&&a\n` does the same with no plugin.
   */
  "highlight-space-run": (n) => "==a ".repeat(n),
  "highlight-newline-run": (n) => "==a\n".repeat(n),
  /**
   * The near-miss: one closer at the end makes the first opener a highlight, so no memo can
   * decline it and only the queue's own cost is left. Testing the whole content at each `==`
   * takes 70 s at 256,000 under `legacy` and 130 s under `strict`; testing the one character takes
   * 2.4 s and 4.0 s there.
   */
  "highlight-late-closer": (n) => "==a ".repeat(n) + "b==",
  /**
   * The same run for `~~`: remark-parse 8's strikethrough reader scanned to the end of the run
   * from every opener, so `legacy` took 238 / 711 / 2,397 ms at 2,000 / 4,000 / 8,000 until a
   * closer table declined each opener with none ahead.
   */
  "strike-space-run": (n) => "~~a ".repeat(n),
  "strike-newline-run": (n) => "~~a\n".repeat(n),
  /**
   * Highlights that each close. `strict` checks every one for emphasis opened before it, and
   * paired every earlier emphasis run of the paragraph again to do so (77 s at 32,000), until it
   * carried the pairing forward from one highlight to the next.
   */
  "highlight-word-run": (n) => "==a== ".repeat(n),
  "comment-open": (n) => "%%".repeat(n),
  "math-open": (n) => "$".repeat(n) + "a",
  /**
   * A line of prices. No `$` here can close, since each follows a space, so every one searched
   * to the end of the run in vain until the reader remembered that one had.
   */
  "math-prices": (n) => "$5 or $6 and ".repeat(n),
  /** The same search in the `$$` reader, whose closer refuses a backslash before it. */
  "math-double-escaped": (n) => "$$ a\\\\".repeat(n),
  /**
   * The same search in `strict`'s `$` reader, where a `$` after a space cannot close: every
   * opener read to the end of the text, 13.6 s at 8,000, until the reader remembered that one had.
   */
  "math-unclosed-run": (n) => "$a ".repeat(n),
  "inline-footnote-open": (n) => "^[".repeat(n) + "a",
  "callout-nest": (n) => "> ".repeat(n) + "[!note] t",
  "tag-run": (n) => "#a/".repeat(n),
  "table-pipes": (n) => `|${"a|".repeat(n)}\n|${"-|".repeat(n)}\n`,
  "footnote-refs": (n) => "[^a]".repeat(n),
  /**
   * The same references, defined: one paragraph of tens of thousands of siblings with no text
   * between them, so stock `remark-gfm` stays linear and only this package's passes are measured.
   * `strict`'s passes found each visited node's index by scanning its siblings.
   */
  "footnote-refs-defined": (n) => "[^a]".repeat(n) + "\n\n[^a]: x\n",
  /**
   * Closing brackets with no opener. The footnote reader walked back over every earlier event
   * on each `]` looking for the `![` of a possible `![^x]`, so 32,000 of them took 23 s under
   * `strict`; it now stops a label's length back. Stock `remark-gfm` still does the walk.
   */
  "bracket-close-run": (n) => "x] ".repeat(n),
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
