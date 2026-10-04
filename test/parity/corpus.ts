/**
 * Deterministic Obsidian-parity corpus.
 *
 * Layered rather than random, because random bytes almost never hit a delimiter
 * boundary: normative seeds, then a token grammar crossed with delimiter states,
 * then structural splicing into contexts that shield or reparse markdown, then
 * adjacency mutations around closing delimiters.
 */

import { HUNT_FIXTURES } from "./corpus-hunt.js";
import { COMMONMARK_SPEC } from "./commonmark.js";
import { readFileSync } from "node:fs";

import { generateRange } from "./fuzz/generate.js";

export type Layer =
  "seed" | "token" | "context" | "adjacency" | "hunt" | "commonmark";

export interface Case {
  readonly id: string;
  readonly layer: Layer;
  readonly category: string;
  readonly markdown: string;
}

/**
 * Cases with documented Obsidian behavior, including the reproductions from
 * quartz-community/remark-obsidian#4 and the forum thread it links.
 */
const SEEDS: ReadonlyArray<readonly [string, string]> = [
  ["math/list-boundary", "1. Hello $$\n   Math\n   $$\n2.\n"],
  [
    "math/text-after-close",
    "Here is an equation\n$$\nx = x + 1\n$$and text after\n\n[[Test 2]]\n",
  ],
  [
    "math/newline-after-close",
    "Here is an equation\n$$\nx = x + 1\n$$\nand text after\n\n[[Test 2]]\n",
  ],
  ["math/heading-swallow", "# H1\n[[#H2]]\n$$\na+b=c\n$$ abc\n# H2\n"],
  ["math/empty-block", "# heading 1\n\n$$\n\n# heading 2\n"],
  ["math/adjacent-blocks", "$$\nP(A)\n$$$$\nP(A)\n$$\n\n[[Later]]\n"],
  ["math/triple-delim", "$$$\nMath\n$$$\n"],
  ["math/close-on-content-line", "$$\nMath$$\n"],
  ["math/unclosed-inner", "$$\n$Math$$\nStill math\n$$\n"],
  ["math/block-own-line", "$$\nE=mc^2\n$$\n"],
  ["math/inline-display", "$$E=mc^2$$\n"],
  ["math/inline", "text $x^2$ text\n"],
  ["math/currency", "$5 and $10\n"],
  ["math/currency-comma", "costs $20,000 today\n"],
  ["math/escaped-dollar", "\\$5 not math\n"],
  ["math/in-table-pipe", "| Math |\n| --- |\n| $|x|$ |\n"],
  ["math/in-blockquote", "> $$\n> x^2\n> $$\n"],

  // Where a `$$` sits on its line decides whether it opens a block, and the
  // recorded cases disagree: `1. Hello $$` opens one, `> tail $$` does not.
  // Two samples cannot separate "mid-line" from "inside a definition" from
  // "inside a quote", so each axis is probed on its own.
  ["math/midline-plain", "tail $$\nx\n$$\n"],
  ["math/midline-quote", "> tail $$\n> x\n> $$\n"],
  ["math/midline-list", "1. tail $$\n   x\n   $$\n"],
  ["math/midline-definition", "[^1]: def $$\nx\n$$\n"],
  ["math/midline-quoted-definition", "> [^1]: def\n> tail $$\n> x\n> $$\n"],
  ["math/linestart-list", "1. x\n   $$\n   y\n   $$\n"],
  ["math/linestart-definition", "[^1]: def\n    $$\n    y\n    $$\n"],
  ["math/unclosed-quote-lazy", "> $$\nlazy\n"],
  ["math/unclosed-plain", "$$\nlazy\n"],

  // An unclosed `<!--` hides the rest of the note. These measure the shapes
  // the recorder can be trusted on.
  //
  // The container forms are deliberately absent. `> <!--` and `- <!--` were
  // probed and the two renderers disagree: the detached one used for recording
  // hides everything, a real Reading View renders what follows. Recording
  // either would store a value Obsidian does not actually produce, so the
  // question has to be settled through Reading View instead — see
  // `hunt/blockquote-region-outlives-quote/1`, whose expectation came from the
  // unfaithful path.
  ["html/unclosed-comment-plain", "<!--\ndraft\n\nafter\n"],
  ["html/unclosed-comment-inline", "x <!-- draft\n\nafter\n"],
  ["html/closed-comment-quote", "> <!--\n> draft\n> -->\n\nafter\n"],

  // `^[^[note]` renders as literal `^[note` with no footnote element at all,
  // while `^[^[note]]` makes one. Two readings fit: the outer scan balances
  // brackets and the odd `]` fails it, or the scan simply never restarts
  // inside a failed opener the way micromark retries. These separate them —
  // an unbalanced body with no inner `^[` tests the first, and a doubled
  // opener surrounded by text tests the second.
  ["footnote/inline-unbalanced-bracket", "^[a [b]\n"],
  ["footnote/inline-bracket-open-body", "^[[note]\n"],
  ["footnote/inline-doubled-with-text", "x ^[^[note] y\n"],
  ["footnote/inline-extra-close", "^[^[note]]]\n"],

  // `^[` nesting: the doubled and nested forms both diverge, and neither is
  // explicable without knowing where Obsidian's scan starts and stops.
  ["footnote/inline-plain", "^[note]\n"],
  ["footnote/inline-unclosed", "^[note\n"],
  ["footnote/inline-bracket-body", "^[a [b] c]\n"],
  ["footnote/inline-escaped-open", "\\^[note]\n"],
  ["footnote/inline-triple", "^[^[^[x]]]\n"],
  ["footnote/inline-ref-body", "^[see [^1]]\n\n[^1]: one\n"],

  ["wikilink/basic", "[[page]]\n"],
  ["wikilink/alias", "[[page|alias]]\n"],
  ["wikilink/heading", "[[page#heading]]\n"],
  ["wikilink/heading-alias", "[[page#heading|alias]]\n"],
  ["wikilink/blockref", "[[page#^block-id]]\n"],
  ["wikilink/embed", "![[embed]]\n"],
  ["wikilink/embed-size", "![[image.png|100x100]]\n"],
  ["wikilink/embed-width", "![[image.png|100]]\n"],
  ["wikilink/empty", "[[]]\n"],
  ["wikilink/spaces-only", "[[ ]]\n"],
  ["wikilink/padded", "[[ page ]]\n"],
  ["wikilink/double-pipe", "[[page||alias]]\n"],
  ["wikilink/trailing-hash", "[[page#]]\n"],
  ["wikilink/self-heading", "[[#heading]]\n"],
  ["wikilink/nested", "[[A[[B]]]]\n"],
  ["wikilink/table-unescaped", "| Link |\n| --- |\n| [[Note|Alias]] |\n"],
  ["wikilink/table-escaped", "| Link |\n| --- |\n| [[Note\\|Alias]] |\n"],
  ["wikilink/in-code-span", "`[[page]]`\n"],
  ["wikilink/in-fence", "```\n[[page]]\n```\n"],
  [
    "wikilink/unicode",
    "[[\u975e\u5e38\u306b\u9577\u3044\u30ce\u30fc\u30c8\u540d]]\n",
  ],
  ["wikilink/emoji", "[[\ud83d\ude00]]\n"],
  ["wikilink/formatted-alias", "[[page|**bold** and *italic*]]\n"],

  ["tag/basic", "#tag\n"],
  ["tag/nested", "#tag/nested\n"],
  ["tag/numeric-only", "#123\n"],
  ["tag/leading-digits", "#123-a\n"],
  ["tag/hex-colour", "Color: #00FFFF\n"],
  ["tag/midword", "foo#bar\n"],
  ["tag/double-hash", "#tag#tag\n"],
  ["tag/emoji", "#\ud83d\ude10\n"],
  ["tag/parenthesised", "(#tag)\n"],
  ["tag/in-code-span", "`#tag`\n"],
  ["tag/in-fence", "```js\n#tag\n```\n"],
  ["tag/trailing-punctuation", "see #tag, and #other.\n"],

  ["highlight/basic", "==highlighted==\n"],
  ["highlight/trailing-space", "before ==text == after\n"],
  ["highlight/leading-space", "before == text== after\n"],
  ["highlight/triple", "===text==\n"],
  ["highlight/nested-emphasis", "==a **b** c==\n"],
  ["highlight/across-newline", "==a\nb==\n"],
  ["highlight/unterminated", "==a and nothing closes\n"],

  // Emphasis is CommonMark's own construct, and Obsidian's legacy tokenizer
  // diverges on it. Run lengths the TOKENS layer cannot express (it only reaches
  // 1/1, 1/2, 2/1, 2/2, 4/2 and 2/4) are enumerated here.
  ["emphasis/run-3-3", "***a***\n"],
  ["emphasis/run-3-2", "***a**\n"],
  ["emphasis/run-2-3", "**a***\n"],
  ["emphasis/run-3-1", "***a*\n"],
  ["emphasis/run-1-3", "*a***\n"],
  ["emphasis/run-4-4", "****a****\n"],
  ["emphasis/run-5-5", "*****a*****\n"],
  ["emphasis/underscore-1-1", "_a_\n"],
  ["emphasis/underscore-2-2", "__a__\n"],
  ["emphasis/underscore-3-3", "___a___\n"],
  ["emphasis/underscore-3-2", "___a__\n"],

  // Flanking: whether a delimiter run may open or close depends on the characters
  // on either side of it. This is the rule Obsidian does not apply.
  ["emphasis/flank-both-space", "a * b * c\n"],
  ["emphasis/flank-correct", "a *b* c\n"],
  ["emphasis/flank-open-space", "a * b* c\n"],
  ["emphasis/flank-close-space", "a *b * c\n"],
  ["emphasis/flank-inverted", "a* b *c\n"],
  ["emphasis/flank-intraword-star", "a*b*c\n"],
  ["emphasis/flank-intraword-underscore", "a_b_c\n"],
  ["emphasis/flank-underscore-space", "a _ b _ c\n"],
  ["emphasis/flank-punct-inside", "*(a)*\n"],
  ["emphasis/flank-punct-outside", "(*a*)\n"],
  ["emphasis/flank-punct-adjacent", "a.*b*.c\n"],
  ["emphasis/flank-cjk", "\u65e5\u672c*\u8a9e*\u30c6\u30b9\u30c8\n"],
  // `*` plus a space at line start is a bullet, so the run never reaches the
  // inline tokenizer at all.
  ["emphasis/flank-line-start", "* a *\n"],
  ["emphasis/flank-trailing-run", "**a ** b\n"],

  ["emphasis/nest-strong-em", "**a *b* c**\n"],
  ["emphasis/nest-em-strong", "*a **b** c*\n"],
  ["emphasis/nest-mixed-markers", "**a _b_ c**\n"],
  ["emphasis/nest-underscore-outer", "_a *b* c_\n"],
  ["emphasis/nest-leading-em", "***a* b**\n"],
  ["emphasis/nest-trailing-em", "**a *b***\n"],
  ["emphasis/nest-interleaved", "*a **b* c**\n"],
  ["emphasis/nest-repeated-strong", "**a **b** c**\n"],

  ["emphasis/escape-inner", "*a\\*b*\n"],
  ["emphasis/escape-before-close", "**a\\**\n"],
  ["emphasis/escape-first-of-run", "\\**a**\n"],

  ["emphasis/unterminated-strong", "**unterminated\n"],
  ["emphasis/across-blank-line", "*a\n\nb*\n"],
  ["emphasis/across-newline", "**a\nb**\n"],

  // Emphasis crossed with Obsidian's own constructs, where our tokenizers and
  // Obsidian's have to agree on precedence as well as on flanking.
  ["emphasis/in-highlight", "==**a**==\n"],
  ["emphasis/wraps-highlight", "**==a==**\n"],
  ["emphasis/wraps-wikilink", "**[[link]]**\n"],
  ["emphasis/wraps-embed", "**![[embed]]**\n"],
  ["emphasis/wraps-tag", "**#tag**\n"],
  ["emphasis/after-tag", "#tag**bold**\n"],
  ["emphasis/wraps-inline-math", "**$x$**\n"],
  ["emphasis/inside-inline-math", "$*x*$\n"],
  ["emphasis/wraps-comment", "**%%c%%**\n"],
  ["emphasis/in-comment", "%%**a**%%\n"],
  ["emphasis/spans-wikilink", "**a [[b]] c**\n"],
  ["emphasis/unbalanced-in-alias", "[[page|**a]]\n"],
  ["emphasis/in-task", "- [ ] **a**\n"],
  ["emphasis/in-heading", "# **a**\n"],
  ["emphasis/in-callout-title", "> [!note] **a**\n"],

  ["comment/inline", "This is an %%inline%% comment.\n"],
  ["comment/block", "%%\nblock comment\nspanning lines\n%%\nafter\n"],
  ["comment/nested", "%%\nline %% nested %% line\n%%\nafter\n"],
  ["comment/empty", "# Heading 1\n%%%%\n# Heading 2\n"],
  ["comment/unterminated", "%%\nnever closed\n"],

  ["task/unchecked", "- [ ] todo\n"],
  ["task/checked", "- [x] done\n"],
  ["task/custom-char", "- [/] partial\n- [?] question\n- [-] cancelled\n"],
  ["task/reparse-ordered", "- [ ] 1.\n"],
  ["task/reparse-paren", "- [ ] 1) text\n"],
  ["task/reparse-bullet", "- [ ] - bullet\n"],
  ["task/reparse-quote", "- [ ] > quote\n"],
  ["task/reparse-plain", "- [ ] 1\n- [ ] 1.1\n"],
  ["task/nested-tab", "- [ ] parent\n\t- [ ] child\n"],

  ["callout/basic", "> [!note] Title\n> Body\n"],
  ["callout/collapsed", "> [!note]- Collapsed\n> Hidden\n"],
  ["callout/expanded", "> [!note]+ Expanded\n> Shown\n"],
  ["callout/unknown-type", "> [!custom] Custom\n> Body\n"],
  ["callout/titleless", "> [!warning]\n> Body\n"],
  ["callout/nested", "> [!question] Outer\n> > [!todo] Inner\n> > Body\n"],
  ["callout/in-list", "- item\n  > [!note]\n  > body\n"],

  ["footnote/ref", "Text with a footnote[^1].\n\n[^1]: Footnote text.\n"],
  ["footnote/inline", "Text with an inline footnote.^[Inline text.]\n"],
  [
    "footnote/in-table",
    "| A [^1] | B |\n| --- | --- |\n| C | D |\n\n[^1]: Footnote.\n",
  ],

  [
    "html/passthrough",
    "<div>\n**not bold**\n[[not a wikilink]]\n#not-a-tag\n</div>\n",
  ],
  ["html/span-inline", "<span>**not bold** [[link]]</span>\n"],

  [
    "frontmatter/basic",
    "---\ntags:\n  - project\naliases:\n  - Example\n---\n\nBody\n",
  ],
  [
    "frontmatter/unterminated-string",
    '---\ntitle: "unterminated\n---\n\nBody\n',
  ],
  ["frontmatter/wikilink-value", "---\ntags:\n  - [[Note]]\n---\n\nBody\n"],
  ["frontmatter/empty", "---\n---\n\nBody\n"],

  ["escape/backslash-run", "\\*not emphasis\\* and \\[\\[not a link\\]\\]\n"],
  ["breaks/single-newline", "line one\nline two\n"],

  // Sent by the author of Obsidian Footnotes Shortcuts as places Obsidian
  // deviates from stock remark-parse 8 + remark-footnotes 2 + remark-math 3.
  // Every callout point in that list was already confirmed by goldens here,
  // so the rest is recorded rather than taken on trust -- reading one rule's
  // "EOL" as end-of-string instead of a newline had already broken every
  // titleless callout once.
  ["callout/line-after-title-is-fresh-block", "> [!note]\n> [^1]: x\n"],
  ["callout/text-after-marker-is-block", "> [!note] [^1]: x\n"],
  ["callout/only-first-line-is-title", "> a\n> [!note] T\n"],
  ["callout/marker-in-list-defines", "- > [!note] [^1]: x\n"],
  ["callout/marker-in-quote-defines", "> > [!note] [^1]: x\n"],
  ["list/lazy-line-ignored-for-min-indent", "- a\nlazy\n\n    [^1]: x\n"],
  ["list/indented-definition-in-item", "- a\n\n    [^1]: x\n"],
  ["table/leading-space-breaks-pipe-style", " | a |\n| --- |\n"],
  ["table/delimiter-leading-space", "| a |\n | --- |\n"],
  ["table/first-non-row-ends-it", "| a |\n| --- |\n| b |\nnot a row\n| c |\n"],
  ["table/definition-row-ends-piped-table", "| a |\n| --- |\n[^1]: x | y\n"],
  ["wikilink/contents-are-inert", "[[a|[^1]]]\n\n[^1]: x\n"],
  ["wikilink/second-open-moves-start", "[[a[[b]]\n"],
  ["wikilink/does-not-span-lines", "[[a\nb]]\n"],
  ["frontmatter/closing-tail-is-markdown", "---\na: b\n---[^2]: x\n"],
  ["frontmatter/indented-opener-is-not", " ---\na: b\n---\n"],
  ["frontmatter/closing-line-trailing-text", "---\na: b\n--- trailing\n"],
  ["comment/other-percent-does-not-open", "%% 50%\nstill text\n"],
  ["comment/triple-percent-does-not-open", "%%%\ntext\n"],
  ["comment/closes-inside-backticks", "%%\na\n`%%`\nb\n"],
  ["comment/does-not-end-a-definition", "[^1]: a\n%%\nb\n"],
  ["comment/interrupts-a-paragraph", "a\n%%\nb\n"],
  ["comment/indented-under-list-item", "- a\n    %%\n    b\n"],
  ["comment/references-inside-are-counted", "%%\na [^1]\n%%\n\n[^1]: x\n"],
  ["math/midparagraph-inline-across-lines", "x $$a\nb$$ y\n"],
  ["math/midparagraph-stops-at-blank-line", "x $$a\n\nb$$ y\n"],
  ["inline-footnote/reference-inside-is-dead", "^[see [^1]]\n\n[^1]: x\n"],
  ["inline-footnote/label-inside-is-dead", "^[[^1]: x]\n"],
  ["inline-footnote/nested-note-is-dead", "^[a ^[b] c]\n"],

  // Closing the colour-marker set. The circle and square families were
  // already exhaustive -- all nine of each -- so what was open is whether
  // any other colour-bearing family qualifies, and how the marker behaves
  // against whitespace, nesting and an escaped opener.
  ["highlight/fam-heart-orange", "==\ud83e\udde1 text==\n"],
  ["highlight/fam-heart-yellow", "==\ud83d\udc9b text==\n"],
  ["highlight/fam-heart-green", "==\ud83d\udc9a text==\n"],
  ["highlight/fam-heart-blue", "==\ud83d\udc99 text==\n"],
  ["highlight/fam-heart-purple", "==\ud83d\udc9c text==\n"],
  ["highlight/fam-heart-black", "==\ud83d\udda4 text==\n"],
  ["highlight/fam-book-red", "==\ud83d\udcd5 text==\n"],
  ["highlight/fam-book-green", "==\ud83d\udcd7 text==\n"],
  ["highlight/fam-book-blue", "==\ud83d\udcd8 text==\n"],
  ["highlight/fam-book-orange", "==\ud83d\udcd9 text==\n"],
  ["highlight/fam-sq-med-black", "==\u25fc text==\n"],
  ["highlight/fam-sq-med-white", "==\u25fb text==\n"],
  ["highlight/fam-sq-small-black", "==\u25fe text==\n"],
  ["highlight/fam-sq-small-white", "==\u25fd text==\n"],
  ["highlight/fam-sq-tiny-black", "==\u25aa text==\n"],
  ["highlight/fam-sq-tiny-white", "==\u25ab text==\n"],
  ["highlight/fam-diamond-blue-lg", "==\ud83d\udd37 text==\n"],
  ["highlight/fam-diamond-blue-sm", "==\ud83d\udd39 text==\n"],
  ["highlight/fam-diamond-orange-sm", "==\ud83d\udd38 text==\n"],
  ["highlight/fam-triangle-down", "==\ud83d\udd3b text==\n"],
  ["highlight/fam-radio-button", "==\ud83d\udd18 text==\n"],
  ["highlight/fam-circle-red-vs", "==\ud83d\udd34\ufe0f text==\n"],
  ["highlight/emoji-space-before", "== \ud83d\udd34 text==\n"],
  ["highlight/emoji-nested", "==\ud83d\udd34 a ==\ud83d\udfe2 b== c==\n"],
  ["highlight/emoji-escaped-opener", "\\==\ud83d\udd34 text==\n"],
  ["highlight/emoji-in-comment", "%%==\ud83d\udd34 text==%%\n"],
  ["highlight/emoji-tab-after", "==\ud83d\udd34\ttext==\n"],
  ["highlight/emoji-newline-after", "==\ud83d\udd34\ntext==\n"],

  // Pins which pictographs 1.14 treats as a colour marker: the diff showed
  // the squares and the red circle consumed while a grinning face, a
  // variation-selector heart and a ZWJ family were left alone.
  ["highlight/set-circle-orange", "==\ud83d\udfe0 text==\n"],
  ["highlight/set-circle-yellow", "==\ud83d\udfe1 text==\n"],
  ["highlight/set-circle-green", "==\ud83d\udfe2 text==\n"],
  ["highlight/set-circle-blue", "==\ud83d\udd35 text==\n"],
  ["highlight/set-circle-purple", "==\ud83d\udfe3 text==\n"],
  ["highlight/set-circle-brown", "==\ud83d\udfe4 text==\n"],
  ["highlight/set-circle-black", "==\u26ab text==\n"],
  ["highlight/set-circle-white", "==\u26aa text==\n"],
  ["highlight/set-square-orange", "==\ud83d\udfe7 text==\n"],
  ["highlight/set-square-purple", "==\ud83d\udfea text==\n"],
  ["highlight/set-square-brown", "==\ud83d\udfeb text==\n"],
  ["highlight/set-square-black", "==\u2b1b text==\n"],
  ["highlight/set-square-white", "==\u2b1c text==\n"],
  ["highlight/set-heart-red", "==\u2764 text==\n"],
  ["highlight/set-star", "==\u2b50 text==\n"],
  ["highlight/set-check", "==\u2705 text==\n"],
  ["highlight/set-triangle", "==\ud83d\udd3a text==\n"],
  ["highlight/set-moon", "==\ud83c\udf15 text==\n"],
  ["highlight/set-diamond-orange", "==\ud83d\udd36 text==\n"],
  ["highlight/set-flag", "==\ud83d\udea9 text==\n"],

  // Obsidian 1.14 is reported to colour a highlight from a leading emoji,
  // as Bear does. Whether that is a parse change or only a rendering one
  // decides whether it concerns this package at all: if the emoji is
  // consumed as a marker the highlight's content loses it, if it is left
  // alone nothing here changes. Recorded against both 1.13.7 and 1.14.4.
  ["highlight/emoji-space-text", "==\ud83d\udd34 text==\n"],
  ["highlight/emoji-text-nospace", "==\ud83d\udd34text==\n"],
  ["highlight/square-red", "==\ud83d\udfe5text==\n"],
  ["highlight/square-yellow", "==\ud83d\udfe8 text==\n"],
  ["highlight/square-green", "==\ud83d\udfe9 text==\n"],
  ["highlight/square-blue", "==\ud83d\udfe6 text==\n"],
  ["highlight/emoji-only-body", "==\ud83d\udd34==\n"],
  ["highlight/emoji-midbody", "==te\ud83d\udd34xt==\n"],
  ["highlight/emoji-doubled", "==\ud83d\udd34\ud83d\udfe9text==\n"],
  ["highlight/emoji-noncolor", "==\ud83d\ude00text==\n"],
  ["highlight/emoji-variation-selector", "==\u2764\ufe0f text==\n"],
  [
    "highlight/emoji-zwj-sequence",
    "==\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67 text==\n",
  ],
  ["highlight/emoji-in-callout-title", "> [!note] ==\ud83d\udd34 T==\n"],
  ["highlight/emoji-in-table-cell", "| a |\n| --- |\n| ==\ud83d\udd34 t== |\n"],

  // An edge-case sweep plus the test suites of other Obsidian-Markdown
  // implementations (obsidian-help, goldmark-obsidian, obsidian-export,
  // mdformat-obsidian, lezer-markdown-obsidian, remark-callout, quartz).
  // These reach surface the generated layers cannot: block references above
  // all, which no case covered at all.
  ["block-ref/paragraph-trailing", "A paragraph with an id. ^block-id\n"],
  ["block-ref/no-space-before", "Text^not-an-id\n"],
  ["block-ref/own-line-after-quote", "> A quoted block.\n\n^quote-id\n"],
  ["block-ref/own-line-after-paragraph", "x\n\n^b\n"],
  ["block-ref/own-line-after-list", "- x\n\n^b\n"],
  ["block-ref/own-line-after-table", "| x |\n| --- |\n\n^b\n"],
  ["block-ref/inside-quote", "> x\n>\n> ^b\n"],
  [
    "block-ref/on-list-item",
    "- Item one\n    - Nested item\n      ^nested-id\n",
  ],
  ["block-ref/on-heading", "## Heading ^heading-id\n"],
  ["block-ref/on-setext", "Setext heading ^setext-id\n---\n"],
  ["block-ref/caret-only-line", "^\n"],
  ["block-ref/invalid-underscore", "x ^a_b\n"],
  ["block-ref/duplicate-id", "x ^b\n\ny ^b\n"],
  ["block-ref/after-wikilink", "[[a]] ^b\n"],
  [
    "block-ref/in-callout-list",
    "> [!note]\n> - Item one ^item-one\n> - Item two ^item-two\n",
  ],
  [
    "block-ref/heading-vs-explicit",
    "## Same title\n\n## Same title ^explicit-id\n",
  ],
  ["wikilink/heading-chain", "[[a#b#c|d]]\n"],
  ["wikilink/hash-after-alias", "[[a|b#c]]\n"],
  ["wikilink/multiple-alias-separators", "[[a|b|c]]\n"],
  ["wikilink/empty-target-with-alias", "[[|b]]\n"],
  ["wikilink/target-empty-alias", "[[a|]]\n"],
  ["wikilink/escaped-fragment-separator", "[[a\\#b]]\n"],
  ["wikilink/escaped-alias-separator", "[[a\\|b]]\n"],
  ["wikilink/current-note-heading", "[[#Current heading]]\n"],
  ["wikilink/current-note-block-alias", "[[#^b|c]]\n"],
  ["wikilink/vault-heading-search", "[[## heading text]]\n"],
  ["wikilink/vault-block-search", "[[^^block text]]\n"],
  ["wikilink/block-target-alias", "[[Note#^block-id|Readable label]]\n"],
  ["wikilink/needs-trimming", "[[  Note  #^id  ]]\n"],
  ["wikilink/alias-pipe-in-table", "| Link |\n| --- |\n| [[Note\\|Alias]] |\n"],
  ["embed/alt-and-dimensions", "![[a.png|b|100x200]]\n"],
  ["embed/width-only", "![[image.png|100]]\n"],
  ["embed/width-height", "![[image.png|100x145]]\n"],
  ["embed/alt-text-dimensions", "![[image.png|Alt text 100x200]]\n"],
  ["embed/note-heading-with-size", "![[a#b|100]]\n"],
  ["embed/pdf-page", "![[Document.pdf#page=3]]\n"],
  ["embed/pdf-height", "![[Document.pdf#height=400]]\n"],
  ["embed/pdf-page-with-size", "![[a.pdf#page=3|100x200]]\n"],
  ["embed/block-list-transclusion", "![[Tasks#^my-list-id]]\n"],
  ["embed/wikilink-in-alias", "![[a|[[b]]]]\n"],
  ["embed/missing-block-with-alias", "![[nonexistent#^b|c]]\n"],
  ["embed/unclosed", "![[Unclosed embed\n"],
  ["tag/numeric-path", "#123/456\n"],
  ["tag/digit-leading-mixed", "#1_a-b\n"],
  ["tag/empty-path-segment", "#a//b\n"],
  ["tag/combining-mark", "#\u00e9\n"],
  ["tag/inside-wikilink-alias", "[[a|#b]]\n"],
  ["link/relative-block-fragment", "[x](a.md#^b)\n"],
  ["link/angle-wrapped-space", "[x](<a b.md>)\n"],
  ["link/literal-pipe-destination", "[x](a|b)\n"],
  ["link/obsidian-scheme-autolink", "<obsidian://open?vault=v&file=a>\n"],
  ["link/bare-url-balanced-parens", "https://a.test/x_(y).\n"],
  ["link/reference-style-internal", '[x][a]\n\n[a]: b.md "c"\n'],
  ["link/angle-autolink", "<https://x>\n"],
  ["callout/marker-padding", ">[!note]\n> a\n\n>  [!note]\n> b\n"],
  ["callout/uppercase-type", "> [!NOTE]\n> x\n"],
  ["callout/type-inner-whitespace", "> [! note]\n> a\n\n> [!note ]\n> b\n"],
  ["callout/empty-type", "> [!]\n> x\n"],
  ["callout/attached-title", "> [!note]x\n> y\n"],
  ["callout/fold-title-boundary", "> [!note]-x\n> a\n\n> [!note]+x\n> b\n"],
  [
    "callout/nonstandard-fold-markers",
    "> [!note]\u00b1 T\n> a\n\n> [!note]-+ T\n> b\n",
  ],
  ["callout/custom-type", "> [!project-status]\n> Body\n"],
  ["callout/type-with-spaces", "> [!type with spaces]\n> Body\n"],
  ["callout/marker-on-second-line", "> x\n> [!note]\n> y\n"],
  ["callout/marker-after-empty-quote-line", ">\n> [!note]\n> x\n"],
  ["callout/title-wikilink-and-embed", "> [!note] [[A]] ![[B]]\n"],
  ["callout/title-math-and-code", "> [!note] $x$ `$y$`\n"],
  ["callout/title-tag-and-footnote", "> [!note] #tag [^n]\n\n[^n]: footnote\n"],
  ["callout/title-nested-brackets-and-pipe", "> [!note] [a [b]] | c\n"],
  [
    "callout/title-inline-markdown",
    "> [!note] **Bold** and *italic*\n> Body\n",
  ],
  [
    "callout/title-comment-crosses-body",
    "> [!note] T %%\n> hidden\n> %%\n> visible\n",
  ],
  ["callout/title-wikilink-closes-in-body", "> [!note] [[A\n> B]]\n"],
  ["callout/body-paragraph-separation", "> [!note]\n> a\n>\n> b\n"],
  [
    "callout/three-level-stack",
    "> [!note]\n>> [!tip]\n>>> [!warning]\n>>> x\n",
  ],
  ["callout/body-table", "> [!note]\n> | a |\n> | --- |\n> | b |\n"],
  [
    "callout/body-fence-shields-marker",
    "> [!note]\n> ```md\n> > [!warning]\n> ```\n",
  ],
  [
    "callout/body-fence-blank-line",
    '> [!tip] Code\n>\n> ```js\n> alert("x")\n> ```\n',
  ],
  ["callout/body-list-with-blockquote", "> [!note]\n> - a\n>   > b\n"],
  ["callout/empty-body-before-paragraph", "> [!note] T\n\nx\n"],
  ["callout/lazy-line-and-explicit-exit", "> [!note]\n> a\nb\n\nc\n"],
  ["callout/unquoted-thematic-break", "> [!note]\n> a\n***\nb\n"],
  ["callout/adjacent-markers-without-gap", "> [!note]\n> a\n> [!tip]\n> b\n"],
  ["callout/interrupts-unquoted-paragraph", "a\n> [!note]\n> b\n"],
  ["callout/marker-inside-title", "> [!note] > [!warning] T\n> x\n"],
  ["callout/marker-inside-table-cell", "| a |\n| --- |\n| > [!note] |\n"],
  ["callout/marker-inside-indented-code", "    > [!note]\n    > x\n"],
  [
    "callout/nested-task-list",
    "> [!note]\n> - [ ] Outer task\n> > [!todo]\n> > - [x] Inner task\n",
  ],
  ["blockquote/changing-depth-without-spaces", ">>>a\n>b\n>>c\nd\n"],
  ["blockquote/bare-marker", ">\n"],
  [
    "task/status-alphabet",
    '- [/] a\n- [-] b\n- [>] c\n- [?] d\n- [!] e\n- [*] f\n- ["] g\n- [x] h\n- [X] i\n',
  ],
  ["task/missing-spaces", "- [] a\n- [ ]x\n"],
  ["task/ordered", "1. [ ] a\n"],
  ["task/ordered-custom-status", "1. [?] Question\n2. [-] Cancelled\n"],
  ["task/quote-callout-status", "> - [/] a\n\n> [!note]\n> - [-] b\n"],
  ["task/nested-wikilink-only", "- a\n  - [ ] [[b]]\n"],
  ["task/escaped-marker", "- \\[-\\] Literal text\n"],
  [
    "task/in-html-comment",
    "<!-- - [ ] Hidden task -->\n- <!-- [x] not-a-task --> visible\n",
  ],
  [
    "task/in-obsidian-comment",
    "%%\n- [ ] Hidden task\n- [x] Also hidden\n%%\n",
  ],
  [
    "task/comment-adjacent-marker",
    "- %% hidden prefix %% [ ] text\n- [x] %% hidden suffix %% text\n",
  ],
  ["table/short-center-unbordered", "a|b\n:-:|---\nx|y\n"],
  ["table/colon-only-delimiter", "|a|\n|::|\n|b|\n"],
  ["table/single-column-short-rule", "|a|\n|-|\n|b|\n"],
  ["table/escaped-pipe", "|a|b|\n|---|---|\n|x\\|y|z|\n"],
  ["table/code-pipe", "|a|b|\n|---|---|\n|`x|y`|z|\n"],
  ["table/math-pipe", "|a|b|\n|---|---|\n|$x|y$|z|\n"],
  ["table/blank-line-interruption", "|a|\n|---|\n|b|\n\n|c|\n"],
  ["table/paragraph-interruption", "p\n|a|\n|---|\n|b|\n"],
  ["table/list-container", "- a\n\n  |b|\n  |---|\n  |c|\n"],
  ["table/excess-delimiter-columns", "|a|\n|---|---|\n|b|c|\n"],
  ["table/tab-before-pipe", "| a\t| b |\n| --- | --- |\n| c | d |\n"],
  ["list/marker-switch", "* a\n+ b\n- c\n"],
  ["list/zero-start-seven-next", "0. a\n7. b\n"],
  ["list/paren-digit-limit", "1) a\n1234567890) b\n"],
  ["list/tight-to-loose", "- a\n- b\n\n  c\n"],
  ["list/indent-staircase", " - a\n  - b\n   - c\n    - d\n"],
  ["list/fence-interruption", "- a\n```\nb\n```\n- c\n"],
  ["strikethrough/single-versus-double", "~~a~~ ~b~\n"],
  ["strikethrough/crossing-emphasis", "~~*a~~b*\n"],
  ["heading/atx-recognition-limits", "#a\n\n####### b\n\n#\n"],
  ["heading/closing-hash-rich-content", "# [[a]] #tag $x$ #\n"],
  ["heading/setext-in-list", "- a\n  ---\n"],
  ["frontmatter/not-first-line", "\n---\ntags: [a]\n---\n"],
  ["frontmatter/unclosed-fence", "---\ntags: [a]\n# h\n"],
  ["frontmatter/dot-close", "---\ntags: [a]\n...\n# h\n"],
  ["frontmatter/fence-in-scalar", "---\nx: |\n  ---\n---\ny\n"],
  [
    "frontmatter/flow-tags-aliases",
    "---\ntags: [a, b]\naliases: [name]\nx: '#notatag'\n---\n",
  ],
  ["frontmatter/block-tags", "---\ntags:\n  - journal\n  - personal\n---\n"],
  ["frontmatter/setext-looking-body", "---\nTitle\n---\n"],
  [
    "frontmatter/quoted-wikilink",
    '---\ntitle: A New Hope\nlink: "[[Episode IV]]"\nurl: https://example.com\n---\n',
  ],
  [
    "frontmatter/list-wikilink",
    '---\ncast:\n  - Mark Hamill\n  - "[[Harrison Ford]]"\n---\n',
  ],
  [
    "frontmatter/typed-scalars",
    "---\nyear: 1977\nfavorite: true\ndate: 2020-08-21\n---\n",
  ],
  [
    "frontmatter/json-form",
    '---\n{\n  "tags": ["journal"],\n  "publish": false\n}\n---\n',
  ],
  ["frontmatter/markdown-in-value", '---\ntitle: "**not bold**"\n---\n'],
  ["document/mixed-endings-trailing-spaces", "a  \r\nb \nc   \r\nd\n"],
  ["document/tab-indentation", "- a\n\t- [x] b\n\n\t# c\n"],
  [
    "document/invisible-delimiter-content",
    "==\u00a0== [[\u200b]] $\u00a0x\u00a0$\n",
  ],
  ["thematic-break/paragraph-dashes", "p\n---\nq\n"],
  ["thematic-break/alternative-markers", "a\n***\nb\n___\nc\n- - -\n"],
  ["thematic-break/list-tail", "- a\n---\nb\n"],
  [
    "escape/line-start-delimiters",
    "\\[[a]]\n\\![[b]]\n\\==c==\n\\%%d%%\n\\$e$\n\\*g*\n\\_i_\n\\^[j]\n",
  ],
  ["precedence/container-exit", "> ==a\n\nb==\n"],
  ["precedence/code-math", "`$x$` $`x`$\n"],
  ["precedence/comment-eats-opener", "%%[[%%a]]\n"],
  ["precedence/math-wikilink", "$[[a]]$\n"],
  ["precedence/wikilink-math", "[[$x$]]\n"],
  ["precedence/highlight-tag", "==#tag==\n"],
  ["precedence/html-obsidian-comments", "<!-- %% -->\n# h\n%%\n"],
  ["precedence/frontmatter-boundary", "---\nx: '==a'\n---\nb==\n"],
  ["precedence/fenced-code-boundary", "==a\n```\nb==\n```\nc\n"],
  ["precedence/comment-in-code", "`%% not a comment %%`\n"],
  ["precedence/embed-in-code", "`![[Note]]`\n"],
  [
    "comment/spans-blocks",
    "%%\nHidden paragraph.\n\n- Hidden list\n\n> Hidden quote\n%%\n",
  ],
  [
    "entity/decoded-constructs",
    "&amp; &#35;tag &#x5B;&#x5B;a&#x5D;&#x5D; &bogus;\n",
  ],
  ["html/inline-break", "a<br>b\n"],
  ["html/script-block", "<script>\n# h\n[[a]]\n</script>\n# b\n"],
  ["html/blank-line-interruption", "<div>\n[[a]]\n\n# h\n</div>\n"],
  [
    "html/inline-block-boundary",
    "a <span>*b*</span>\n\n<div>\n*c*\n</div>\n*d*\n",
  ],
  ["html/comment-around-block", "<!--\n- [ ] hidden\n-->\n\n- [ ] visible\n"],
];

/** Inline tokens, each crossed with a set of malformed delimiter states. */
const TOKENS: ReadonlyArray<{
  readonly name: string;
  readonly open: string;
  readonly close: string;
  readonly body: string;
}> = [
  { name: "wikilink", open: "[[", close: "]]", body: "target" },
  { name: "embed", open: "![[", close: "]]", body: "target" },
  { name: "highlight", open: "==", close: "==", body: "text" },
  { name: "comment", open: "%%", close: "%%", body: "text" },
  { name: "inline-math", open: "$", close: "$", body: "x^2" },
  { name: "display-math", open: "$$", close: "$$", body: "x^2" },
  // Included so emphasis also gets the context and adjacency layers: which
  // containers shield it, and which trailing character lets its closer pair.
  { name: "emphasis", open: "*", close: "*", body: "text" },
  { name: "strong", open: "**", close: "**", body: "text" },
  { name: "underscore-emphasis", open: "_", close: "_", body: "text" },
  { name: "inline-footnote", open: "^[", close: "]", body: "note" },
  // GFM's delimiter, included because Obsidian's tokenizer is a fork of
  // remark-parse 8 rather than micromark and need not agree about it.
  { name: "strikethrough", open: "~~", close: "~~", body: "text" },
  // The two wikilink forms that carry a second field. `|` collides with a
  // table cell and `#` with a heading and a tag, so both need the context
  // and adjacency layers rather than a single balanced case.
  { name: "wikilink-alias", open: "[[", close: "]]", body: "target|alias" },
  { name: "wikilink-heading", open: "[[", close: "]]", body: "target#head" },
  // No definition anywhere, so every state here is the bare-reference path.
  { name: "footnote-ref", open: "[^", close: "]", body: "1" },
];

function tokenStates(
  t: (typeof TOKENS)[number],
): ReadonlyArray<readonly [string, string]> {
  const { open, close, body } = t;
  return [
    ["balanced", `${open}${body}${close}`],
    ["no-closer", `${open}${body}`],
    ["no-opener", `${body}${close}`],
    ["doubled-open", `${open}${open}${body}${close}`],
    ["doubled-close", `${open}${body}${close}${close}`],
    ["empty", `${open}${close}`],
    ["whitespace-body", `${open} ${close}`],
    ["nested", `${open}${open}${body}${close}${close}`],
    ["escaped-open", `\\${open}${body}${close}`],
    // A half-escaped closer leaves one unescaped delimiter char, which flips
    // Obsidian's inline-vs-display decision. `$$x\$$` is the reported case.
    ["escaped-close", `${open}${body}\\${close}`],
    ["both-escaped", `\\${open}${body}\\${close}`],
    ["newline-escaped-close", `${open}${body}\n${body}\\${close}`],
    ["newline-body", `${open}${body}\n${body}${close}`],
    ["long-body", `${open}${body.repeat(40)}${close}`],
    ["unicode-body", `${open}\u65e5\u672c\u8a9e\u30c6\u30b9\u30c8${close}`],
  ];
}

/** Contexts that either shield markdown or reparse their contents. */
const CONTEXTS: ReadonlyArray<{
  readonly name: string;
  readonly wrap: (s: string) => string;
}> = [
  { name: "paragraph", wrap: (s) => `${s}\n` },
  { name: "heading", wrap: (s) => `# ${s}\n` },
  { name: "list-item", wrap: (s) => `- ${s}\n` },
  { name: "ordered-item", wrap: (s) => `1. ${s}\n` },
  { name: "task-item", wrap: (s) => `- [ ] ${s}\n` },
  { name: "nested-list", wrap: (s) => `- outer\n  - ${s}\n` },
  { name: "blockquote", wrap: (s) => `> ${s}\n` },
  { name: "callout", wrap: (s) => `> [!note] Title\n> ${s}\n` },
  { name: "table-cell", wrap: (s) => `| H |\n| --- |\n| ${s} |\n` },
  { name: "code-span", wrap: (s) => `\`${s}\`\n` },
  { name: "fenced-code", wrap: (s) => `\`\`\`\n${s}\n\`\`\`\n` },
  { name: "html-block", wrap: (s) => `<div>\n${s}\n</div>\n` },
  { name: "indented-code", wrap: (s) => `    ${s}\n` },
  // Containers whose own syntax can collide with an inline token: a `|` with
  // a table was already covered, these add a `#`, a `^`, a `]` and a `-`.
  { name: "frontmatter-after", wrap: (s) => `---\nk: v\n---\n\n${s}\n` },
  { name: "footnote-definition", wrap: (s) => `[^1]: ${s}\n` },
  { name: "nested-quote", wrap: (s) => `> > ${s}\n` },
  { name: "link-label", wrap: (s) => `[${s}](https://example.com)\n` },
  { name: "setext-heading", wrap: (s) => `${s}\n===\n` },
];

/** What follows a construct decides whether its closer is recognised. */
const ADJACENCY: ReadonlyArray<readonly [string, string]> = [
  ["space", " next"],
  ["period", ". next"],
  ["comma", ", next"],
  ["close-paren", ") next"],
  ["close-bracket", "] next"],
  ["pipe", "| next"],
  ["newline", "\nnext"],
  ["blank-line", "\n\nnext"],
  ["crlf", "\r\nnext"],
  ["immediate-text", "next"],
  ["hash", "#next"],
  ["dollar", "$next"],
];

/** Constructs whose closing delimiter is the interesting boundary. */
const ADJACENCY_BASES: ReadonlyArray<readonly [string, string]> = [
  ["display-math", "$$\nx\n$$"],
  ["wikilink", "[[target]]"],
  ["embed", "![[target]]"],
  ["highlight", "==text=="],
  ["comment", "%%text%%"],
  ["tag", "#tag"],
  ["inline-math", "$x$"],
  ["emphasis", "*text*"],
  ["strong", "**text**"],
  ["inline-footnote", "^[note]"],
];

/**
 * A fuzz run replaces the corpus rather than extending it.
 *
 * The point of a run is to sweep a seed range against Obsidian and report
 * which seeds disagree; re-recording 2182 known cases alongside them would
 * cost minutes per sweep and tell us nothing new. A failing seed is a
 * complete reproduction on its own, so nothing is lost by isolating them.
 */
function fuzzCases(): Case[] | undefined {
  // Shrinking feeds candidate reductions back through the same recorder, so
  // it needs to supply documents rather than seeds.
  const file = process.env.PARITY_FUZZ_FILE;
  if (file) {
    const supplied = JSON.parse(readFileSync(file, "utf8")) as Array<{
      id: string;
      markdown: string;
    }>;
    return supplied.map((entry) => ({
      id: entry.id,
      layer: "fuzz" as Layer,
      category: "fuzz",
      markdown: entry.markdown,
    }));
  }

  const from = Number(process.env.PARITY_FUZZ_FROM);
  const count = Number(process.env.PARITY_FUZZ_COUNT);
  if (!Number.isInteger(from) || !Number.isInteger(count) || count <= 0) {
    return undefined;
  }
  return generateRange(from, count).map(([seed, markdown]) => ({
    id: `fuzz/${seed}`,
    layer: "fuzz" as Layer,
    category: "fuzz",
    markdown,
  }));
}

export function buildCorpus(): Case[] {
  const fuzz = fuzzCases();
  if (fuzz) return fuzz;

  const cases: Case[] = [];
  const seenMarkdown = new Set<string>();

  const push = (
    id: string,
    layer: Layer,
    category: string,
    markdown: string,
  ): void => {
    if (seenMarkdown.has(markdown)) return;
    seenMarkdown.add(markdown);
    cases.push({ id, layer, category, markdown });
  };

  for (const [id, markdown] of SEEDS) {
    push(id, "seed", id.split("/")[0] ?? "misc", markdown);
  }

  for (const token of TOKENS) {
    for (const [state, snippet] of tokenStates(token)) {
      push(`token/${token.name}/${state}`, "token", token.name, `${snippet}\n`);
    }
  }

  for (const token of TOKENS) {
    const balanced = `${token.open}${token.body}${token.close}`;
    for (const context of CONTEXTS) {
      push(
        `context/${context.name}/${token.name}`,
        "context",
        token.name,
        context.wrap(balanced),
      );
    }
  }

  for (const [baseName, base] of ADJACENCY_BASES) {
    for (const [adjName, suffix] of ADJACENCY) {
      push(
        `adjacency/${baseName}/${adjName}`,
        "adjacency",
        baseName,
        `${base}${suffix}\n`,
      );
    }
  }

  for (const [id, markdown] of COMMONMARK_SPEC) {
    push(id, "commonmark", id.split("/")[1] ?? "misc", markdown);
  }

  for (const fixture of HUNT_FIXTURES) {
    push(fixture.id, "hunt", fixture.category, fixture.markdown);
  }

  return cases;
}

/** Vault-safe filename for a case id. */
export function caseFileName(id: string): string {
  return `${id.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")}.md`;
}
