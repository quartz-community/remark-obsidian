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
  // `metadataCache` reports a well-formed `^[body]` as a *definition* named
  // `[inline0`, spanning the body alone, and an empty `^[]` as a *reference*
  // with an empty name at the caret. Every case in the corpus held at most one
  // inline footnote, so the `0` could be a counter or a constant and nothing
  // here could tell. These five settle it: whether the name increments, whether
  // it restarts in a new block, and whether an empty body takes a number too.
  // The five below settled how inline footnotes are numbered among
  // themselves, and that was not enough: a probe mixing one with an ordinary
  // reference named it `[inline1` where our counter, which advances only on
  // inline footnotes, says `[inline0`. Nothing in 2636 cases discriminated the
  // two rules, because no case put a reference before an inline footnote.
  // These four do, with the reference defined and undefined, before and
  // between -- so the counter's real alphabet is measured rather than assumed.
  ["probe/inline-footnote/ref-then-inline", "a[^1] and ^[x]\n\n[^1]: body\n"],
  ["probe/inline-footnote/undefined-ref-then-inline", "a[^nodef] and ^[x]\n"],
  [
    "probe/inline-footnote/inline-ref-inline",
    "^[a] b[^1] ^[c]\n\n[^1]: body\n",
  ],
  [
    "probe/inline-footnote/definition-first",
    "[^1]: body\n\nuse[^1] and ^[x]\n",
  ],
  // Which bracket pair wins when one encloses another? Obsidian takes the OUTER
  // and leaves the inner literal, where CommonMark takes the inner -- both oracles
  // agree on that for `[foo [bar](/uri)](/uri)`. Reproducing it means replacing
  // micromark's label resolver with legacy's balanced-bracket scan, and the corpus
  // could not adjudicate that: three designed probes covered nested brackets
  // against twenty-seven incidental fuzz hits, so the blast radius was guesswork.
  // These probe the precedence systematically, including every construct that can
  // cross a label boundary, so the port can be measured rather than feared.
  ["probe/label-precedence/plain", "[a](u)\n"],
  ["probe/label-precedence/nested-inline", "[foo [bar](u)](v)\n"],
  [
    "probe/label-precedence/nested-reference",
    "[foo [bar](u)][ref]\n\n[ref]: /r\n",
  ],
  [
    "probe/label-precedence/reference-inside",
    "[foo [bar][ref]](u)\n\n[ref]: /r\n",
  ],
  ["probe/label-precedence/bracket-no-link", "[a [b] c](u)\n"],
  ["probe/label-precedence/image-inside", "[a ![b](u) c](v)\n"],
  ["probe/label-precedence/image-outside", "![foo [bar](u)](v)\n"],
  ["probe/label-precedence/trailing-destination", "[foo](u)](v)\n"],
  ["probe/label-precedence/double-open", "[[a](u)](v)\n"],
  ["probe/label-precedence/code-crosses", "[foo`](u)`\n"],
  ["probe/label-precedence/html-attr-crosses", '[foo <b attr="](u)">\n'],
  ["probe/label-precedence/emphasis-crosses", "[foo *bar](u)*\n"],
  ["probe/label-precedence/wikilink-inside", "[foo [[target]] bar](u)\n"],
  [
    "probe/label-precedence/autolink-crosses",
    "[foo <https://e.test/?q=](u)>\n",
  ],
  // Where does a footnote reference survive inside a link construct? Obsidian
  // indexes one in a link reference definition's *destination* (`[foo]: [^9]`),
  // which is recorded, and the referee shows it also indexing one in a reference
  // link's label where we yield nothing at all. `[[^9]]` is the interesting case
  // because it is two readings at once -- a wikilink targeting `^9`, or a bracket
  // around the footnote reference `[^9]` -- so this is a precedence question
  // between an Obsidian construct and a CommonMark one, and only Obsidian can say.
  // Each case defines `^9` deliberately: `footnoteRefs` lists only references whose
  // name has a definition, so without one every answer is an empty list that agrees
  // with anything and proves nothing.
  [
    "probe/reference-in-link/collection-label",
    "a [text][[^9]] b\n\n[^9]: def\n",
  ],
  ["probe/reference-in-link/bare-wikilink", "a [[^9]] b\n\n[^9]: def\n"],
  ["probe/reference-in-link/link-text", "a [[^9]][text] b\n\n[^9]: def\n"],
  ["probe/reference-in-link/inline-text", "a [[^9]](/url) b\n\n[^9]: def\n"],
  [
    "probe/reference-in-link/inline-title",
    'a [text](/url "[^9]") b\n\n[^9]: def\n',
  ],
  ["probe/reference-in-link/image-alt", "a ![alt [^9]](/url) b\n\n[^9]: def\n"],
  ["probe/reference-in-link/shortcut", "a [text][^9] b\n\n[^9]: def\n"],
  [
    "probe/reference-in-link/definition-title",
    '[foo]: /url "[^9]"\n\n[^9]: def\n',
  ],
  // An unclosed `%%` inside a footnote definition: how far does it reach? The
  // recorded corpus says Obsidian ends the definition *at* the `%%` line where
  // we run past it, which would follow if the comment were bounded by the
  // definition and the definition by its blank line -- the same shape as the
  // quote rule. But `commentInDefinitionTransform` exists because a `%%` does
  // *not* end a definition when the next line continues it lazily, so the two
  // readings have to be separated by evidence rather than argument.
  ["probe/definition-comment/blank-after", "[^1]: one\n%%\n\nuse[^1]\n"],
  ["probe/definition-comment/lazy-after", "[^1]: one\n%%\nb\n"],
  [
    "probe/definition-comment/closed-then-blank",
    "[^1]: one\n%% x %%\n\nuse[^1]\n",
  ],
  ["probe/definition-comment/indented-open", "[^1]: one\n    %%\n\nuse[^1]\n"],
  ["probe/definition-comment/two-definitions", "[^1]: one\n%%\n\n[^2]: two\n"],
  // The column `metadataCache` reports for a definition is short of where the
  // `[` actually sits, by no constant amount: `    [^12]:` is column 2 to it and
  // 4 to us, `- [ ]    [^x]:` is 6 against 9, `- [ ]  [^x]:` is 6 against 7.
  // That is ~500 of the recorded corpus's span disagreements and the largest
  // family left. What a cache reports is not something the legacy stack can
  // arbitrate, so these span indentation and container type to pin the
  // convention -- or to show it is a defect like the author's `P1`/`P2`, in which
  // case reproducing it would be wrong.
  ["probe/definition-column/flush", "[^1]: def\n"],
  ["probe/definition-column/one-space", " [^1]: def\n"],
  ["probe/definition-column/two-spaces", "  [^1]: def\n"],
  ["probe/definition-column/three-spaces", "   [^1]: def\n"],
  ["probe/definition-column/in-quote", "> [^1]: def\n"],
  ["probe/definition-column/in-quote-padded", ">  [^1]: def\n"],
  ["probe/definition-column/in-list", "- [^1]: def\n"],
  ["probe/definition-column/in-list-padded", "-  [^1]: def\n"],
  ["probe/definition-column/in-task", "- [ ] [^1]: def\n"],
  ["probe/definition-column/in-task-padded", "- [ ]  [^1]: def\n"],
  // `%%` is Obsidian's own construct, so the legacy stack cannot arbitrate it
  // the way it settles a tab or a fence -- and inferring a rule from the
  // recorded corpus instead went wrong once already: documents matching
  // "`%%`, blank line, definition" looked like evidence for a blank-line
  // terminator until `hunt/obsidian-comments/22` showed an unclosed `%%` at the
  // top level running to end of file, blank lines and all. The apparent
  // evidence was openers that were never openers (`%% %` holds a second `%`)
  // and comments sitting inside a container.
  //
  // So these are recorded rather than reasoned. They isolate one question: what
  // does a comment opened inside a quote do with the lines after it?
  ["probe/quote-comment/crossing-definition", "> %%\n[^1]: def\n"],
  ["probe/quote-comment/crossing-text", "> %%\ntext\n"],
  ["probe/quote-comment/quoted-definition", "> %%\n> [^1]: def\n"],
  ["probe/quote-comment/blank-then-definition", "> %%\n\n[^1]: def\n"],
  ["probe/quote-comment/continues-then-blank", "> %%\n> more\n\n[^1]: def\n"],
  ["probe/quote-comment/root-then-quoted", "%%\n> [^1]: def\n"],
  ["probe/quote-comment/midline-opener", "> a %%\n[^1]: def\n"],
  // Enumerating Obsidian's tokenizers rather than sampling them found no
  // construct at zero coverage, but three were thin enough to be untested in
  // practice -- and bare autolinking is the risky one. remark-parse 8 has its
  // own `url` and `email` inline tokenizers while our side gets literal
  // autolinks from GFM, so the two are independent implementations that agree
  // only by coincidence. `www.` is the sharpest probe: GFM autolinks it and
  // remark-parse 8 has no rule for it at all.
  ["probe/autolink/bare-email", "write a@b.com now\n"],
  ["probe/autolink/email-subdomain", "write a.b@c.co.uk now\n"],
  ["probe/autolink/email-plus", "write a+tag@b.com now\n"],
  ["probe/autolink/email-underscore-domain", "write a@b_c.com now\n"],
  ["probe/autolink/email-no-tld", "write a@b now\n"],
  ["probe/autolink/email-trailing-dot", "write a@b.com. now\n"],
  ["probe/autolink/bare-url", "see http://a.com now\n"],
  ["probe/autolink/url-www", "see www.example.com now\n"],
  ["probe/autolink/url-trailing-punctuation", "see http://a.com/x. now\n"],
  ["probe/autolink/url-parens", "see http://a.com/x_(y) now\n"],
  ["probe/autolink/url-in-parens", "see (http://a.com) now\n"],
  ["probe/autolink/url-query", "see http://a.com?q=1&b=2 now\n"],
  // The other two thin tokenizers: a backslash at end of line, and a
  // reference-style link, which is not the same construct as the definition
  // that resolves it.
  ["probe/break/backslash", "one\\\ntwo\n"],
  ["probe/break/backslash-in-quote", "> one\\\n> two\n"],
  ["probe/reference/full", "[text][label]\n\n[label]: /url\n"],
  ["probe/reference/collapsed", "[label][]\n\n[label]: /url\n"],
  ["probe/reference/shortcut", "[label]\n\n[label]: /url\n"],
  ["probe/reference/image", "![alt][label]\n\n[label]: /img.png\n"],
  // Two recorded answers about block identifiers contradict each other under
  // any single rule: `^blk` alone registers *no* block, while ` ^blk` -- the
  // same line with one leading space -- registers one, and `^blk` over `---`
  // registers one too. So "preceded by whitespace" explains the first pair and
  // not the third. These isolate what the identifier must trail, which
  // characters it may hold, and where its span begins.
  ["probe/block-id/alone", "^blk\n"],
  ["probe/block-id/leading-space", " ^blk\n"],
  ["probe/block-id/after-text", "text ^blk\n"],
  ["probe/block-id/own-line-after-text", "text\n^blk\n"],
  ["probe/block-id/setext", "^blk\n---\n"],
  ["probe/block-id/heading", "# head ^blk\n"],
  ["probe/block-id/in-quote", "> text ^blk\n"],
  ["probe/block-id/in-list", "- item ^blk\n"],
  ["probe/block-id/underscore", "text ^a_b\n"],
  ["probe/block-id/uppercase", "text ^BLK\n"],
  ["probe/block-id/trailing-space", "text ^blk \n"],
  ["probe/block-id/two-ids", "text ^one ^two\n"],
  // `listItems[].parent` encodes nesting as a negative number for a root item,
  // and the two values recorded so far -- -1 for an item on line 0 and -10 for
  // one on line 10 -- fit no formula yet. A child's value should be a real line
  // number, which is what makes the root encoding readable by contrast.
  ["probe/list-item/two-roots", "- a\n- b\n"],
  ["probe/list-item/one-child", "- a\n  - b\n"],
  ["probe/list-item/three-deep", "- a\n  - b\n    - c\n"],
  ["probe/list-item/offset-by-two", "text\n\n- a\n  - b\n"],
  ["probe/list-item/ordered", "1. a\n2. b\n"],
  ["probe/list-item/in-quote", "> - a\n>   - b\n"],
  ["probe/list-item/tasks", "- [ ] todo\n- [x] done\n- plain\n"],
  // Obsidian runs on Windows and our tokenizers handle a carriage return, but
  // at fourteen cases the corpus barely exercised one and nothing at all
  // covered a lone CR or a byte-order mark. The axis becomes deliberate here.
  ["probe/line-ending/crlf-paragraph", "a\r\nb\r\n"],
  ["probe/line-ending/crlf-quote-list", "> - a\r\n>   b\r\n"],
  ["probe/line-ending/crlf-footnote", "x[^1]\r\n\r\n[^1]: body\r\n"],
  ["probe/line-ending/crlf-setext", "para\r\n===\r\n"],
  [
    "probe/line-ending/crlf-comment",
    "%%\r\nhidden [^1]\r\n%%\r\n\r\n[^1]: d\r\n",
  ],
  ["probe/line-ending/lone-cr", "a\rb\r"],
  ["probe/line-ending/bom-heading", "\ufeff# H\n\ntext\n"],
  ["probe/inline-footnote/two-inline", "^[one] and ^[two]\n"],
  ["probe/inline-footnote/three-inline", "^[a] ^[b] ^[c]\n"],
  ["probe/inline-footnote/two-blocks", "^[a]\n\n^[b]\n"],
  ["probe/inline-footnote/empty-then-body", "^[] and ^[x]\n"],
  ["probe/inline-footnote/body-then-empty", "^[x] and ^[]\n"],
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

  // Reduced by the fuzz shrinker from randomly composed documents, each the
  // smallest input that still disagreed with Obsidian. Minimal and distinct,
  // so they read as ordinary cases rather than as generated noise.
  ["fuzz/highlight/42", "- [ \n===\n"],
  ["fuzz/block-ref/10", "^blk\n---\n"],
  ["fuzz/html/15", "# <mailto:a@e.test>\n"],
  ["fuzz/table/12", "> > [[[link](u)]] | https:\n"],
  ["fuzz/highlight/43", "- [ ] %\n===\n"],
  ["fuzz/embed/66", "^![[[link](u)]]] \n"],
  ["fuzz/inline-footnote/16", "^[]**\n"],
  ["fuzz/strikethrough/9", "* ~~del\\~~\n"],
  ["fuzz/embed/67", "  ![[i.png|100x200]]\n[[a|b]]\t\n"],
  ["fuzz/highlight/44", "> <mailto:a@e.test> | ==日本語==\n"],
  ["fuzz/footnote/27", "[^1]: # <htt\n"],
  ["fuzz/highlight/45", "> > ~~\n===\n"],
  ["fuzz/embed/68", "> > ![[\n===\n"],
  ["fuzz/embed/69", "![[$x^2$]]\t&amp;\n[[~~del\\~~]]\n"],
  ["fuzz/inline-footnote/17", "# \\[[a|b]] | $$x^2$$_under_ | [^[^1]\n"],
  ["fuzz/highlight/46", "- [ ] ~~del~~\n===\n"],
  ["fuzz/wikilink/12", ":a@e.test>](<br>, [[[[target]]]]\n"],
  ["fuzz/inline-footnote/18", "| ^[^[inline]\n"],
  ["fuzz/comment/10", "ote%%[[]]]([[target\n"],
  ["fuzz/embed/70", "![[==[[target]]==]]\n"],
  ["fuzz/footnote/28", "> > [^1]\n===\n"],
  ["fuzz/embed/71", "[^1]: # ![[\n"],
  ["fuzz/footnote/29", "[^1]\nmark==\n---\n"],
  ["fuzz/math/12", "> $$\nunder_\n"],
  ["fuzz/footnote/30", "[^1]: > [!note\n    [[target]]\n"],
  ["fuzz/embed/72", "> [!note] ![[a#h]]]] | ![[i.png|100x200]] [[$]]\n"],
  ["fuzz/misc/5", "https://e.test/p](`code`\n"],
  ["fuzz/embed/73", "> ![[d.pdf#page=3]]]]%%note\\%%, [[target]], $#a/b$\n"],
  ["fuzz/inline-footnote/19", "```\n\n```\n\n^[], **s\n"],
  ["fuzz/strikethrough/10", "]]~~~~\n"],
  ["fuzz/highlight/47", "1. *em\n===\n"],
  ["fuzz/footnote/31", "u)[[$[^]$]]\n"],
  ["fuzz/inline-footnote/20", "^[^[inline]*em*\n"],
  ["fuzz/callout/8", "> [!\n[[a|b]]\n---\n"],
  ["fuzz/embed/74", "est> | ![[==[[a#^blk]]==]]\n"],
  [
    "fuzz/embed/75",
    "] ^[i\n    > [!note] $![[d.pdf#page=3]]]]$ \\ ![[img.png]]\n",
  ],
  ["fuzz/highlight/48", "  [[\n#tag\n===\n"],
  ["fuzz/embed/76", "[日本語\n![[i\n---\n"],
  ["fuzz/math/13", "](u)$^blk$\n​ **st\n"],
  ["fuzz/html/16", "> \\ <mailto:a@e.test>\n"],
  ["fuzz/highlight/49", "y^2$\n$y^2$\n===\n"],
  ["fuzz/footnote/32", "[^1]: # \\\n"],
  ["fuzz/embed/77", "[^![[img.png]]]\n"],
  ["fuzz/wikilink/13", "[[[[a#^blk\\]]]]\n"],
  ["fuzz/inline-footnote/21", "]]\t[^[^]]\n"],
  ["fuzz/embed/78", "# ![[[[link](u)]]](\\[^1]\n"],
  ["fuzz/block-ref/11", "^blk <mailto:a@e.test>\n"],
  ["fuzz/highlight/50", "> > ***em***](\n===\n"],
  ["fuzz/embed/79", "- [[a|b]]. ![[d.pdf#page=3. [[word]]\n"],
  ["fuzz/footnote/33", "[^1]: **\n    %%note\n    [[target]]\n"],
  ["fuzz/footnote/34", "[^%%note%%]\n"],
  ["fuzz/embed/80", "![[img.png]] [[[[a#^blk]]\n"],
  ["fuzz/embed/81", "  [[![[i.png|100x200]]]] \\ $x^2$[[a|b]]](_under_\n"],
  ["fuzz/highlight/51", "> **\n===\n"],
  ["fuzz/callout/9", "> [!no\n===\n"],
  ["fuzz/highlight/52", "1. &a\n===\n"],
  ["fuzz/html/17", "<div>\n(&amp;\n"],
  ["fuzz/inline-footnote/22", "> #tag. ^[^[inline][[\n"],
  ["fuzz/table/13", "[[*e\n\t~~del\\~~ | 日本語\n"],
  ["fuzz/wikilink/14", "[[a#^blk\\]] \n"],
  ["fuzz/embed/82", "%%\\![[d.pdf#page=3]]%%\n"],
  ["fuzz/comment/11", "a@e.test> %%[link](u)%%\n"],
  ["fuzz/setext/4", "_under_\n_under_\n---\n"],
  ["fuzz/embed/83", "1. <mailto:a@e.test> \\![[d.pdf#page=3]]\n"],
  ["fuzz/emphasis/2", "_``code`_\n"],
  ["fuzz/highlight/53", "<br>\n===\n"],
  ["fuzz/embed/84", "# ![[![[i.png|100]]\t[[==mark\\==]]\n"],
  ["fuzz/footnote/35", "[^1]: > [!\n    [[a#^blk]]\n"],
  ["fuzz/html/18", "&amp;. <mailto:a@e.test>\n"],
  ["fuzz/embed/85", "et]] ![[日本語]]\n[[target]]\n"],
  ["fuzz/embed/86", "]. word, ​\t![[#tag]]\n"],
  ["fuzz/misc/6", "1]. ``code`\n"],
  ["fuzz/html/19", "<div>\n[&amp;]]\n"],
  ["fuzz/footnote/36", "[^1]: \nne]~~]]\n"],
  ["fuzz/embed/87", "![[d.pdf#page=3]], [[target]]\n"],
  ["fuzz/embed/88", "  $x^2$\t \t![[i.png|100]]]]\n ![[[[a|b]]\n"],
  ["fuzz/footnote/37", "[^~~ ~~]\n"],
  ["fuzz/embed/89", "  [[a|b]]](<mailto:a@e.test>\t![[==mark==]]\n"],
  ["fuzz/inline-footnote/23", "|   [[^[inline]\n"],
  ["fuzz/embed/90", ". ![[d.pdf#page=3]]\tx^2$\n- [[target]]\n"],
  ["fuzz/embed/91", "![[* *]]\n"],
  ["fuzz/embed/92", "- [ ]\n![[*\n"],
  ["fuzz/table/14", "| $y^2$\n****st\n"],
  ["fuzz/footnote/38", "1. [^==mark==]\n"],
  ["fuzz/entity/2", "- &amp;\n</div>\n"],
  ["fuzz/table/15", "[[a|b]]\n[[~~\n---\n"],
  ["fuzz/highlight/54", "- [ ] !\n===\n"],
  ["fuzz/footnote/39", "[^1]: # [[[\n"],
  ["fuzz/footnote/40", "[^1]: # $x^2\n"],
  ["fuzz/wikilink/15", "# [[a#^blk \\ \\[[a#h]]\n"],
  ["fuzz/embed/93", "![[im\nimg.pn\n---\n"],
  ["fuzz/wikilink/16", " [[a#h\\]]\n"],
  ["fuzz/embed/94", "> $![[d.pdf#page=3]]$\n​\n"],
  ["fuzz/embed/95", "> ![[i.png|100x200]]\n> [[a|b]]\n"],
  ["fuzz/embed/96", " ![[img.png]]\n> > \\![[d.pdf#page=3]]\n"],
  ["fuzz/block-ref/12", "^2$. $\n"],
  ["fuzz/embed/97", "> [!note] `~~~~`![[i.png|100, ![[i.png|100x200]]\n"],
  ["fuzz/inline-footnote/24", "- ^[]]\n"],
  ["fuzz/html/20", "]<mailto:a@e.test>\n"],
  ["fuzz/embed/98", "]==. ![[[[a#^blk\\]]]]\n"],
  ["fuzz/embed/99", "1. ![[[link](u)](u)]].\n"],
  ["fuzz/footnote/41", "> [!note] 日本語 | [^$https://e.test/p$]\n"],
  ["fuzz/inline-footnote/25", "> > ^[], 日本語,\n"],
  ["fuzz/callout/10", "> [!no\n [lin\n---\n"],
  ["fuzz/embed/100", "==![[$x^2$]]==\n"],
  ["fuzz/highlight/55", "**str\n    *e\n===\n"],
  ["fuzz/strikethrough/11", "~~~~del~~\n"],
  ["fuzz/embed/101", "t>, ![[i.png|100]]\n[[a#h]]\n"],
  [
    "fuzz/embed/102",
    "> [!note] ![[i.png|100x200]]](**[[a|b**\t\\![[d.pdf#page=3]]\n",
  ],
  ["fuzz/embed/103", "[^1]: ​\n    ![[*![[i.png|100x200]]*]]\n| ~~[^1]~~\n"],
  ["fuzz/highlight/56", "> > `c\n===\n"],
  ["fuzz/embed/104", "> > ![[img.png]], **strong [[$y^2$]]\t[^1\n"],
  ["fuzz/highlight/57", "- [ ] _\n===\n"],
  ["fuzz/embed/105", "1. _![[link](u)]]_. \n"],
  ["fuzz/embed/106", "# ![[==[[a|b]]==\n"],
  ["fuzz/highlight/58", "> > ==[[a#h]]]]== | <http\n"],
  ["fuzz/wikilink/17", "*em*]\n[[**str\n---\n"],
  ["fuzz/html/21", "<mailto:a@e.test>. **strong\n"],
  ["fuzz/embed/107", "word](![[![[``]]]]\t[[*https://e.test/p*]]\n"],
  ["fuzz/highlight/59", "[[a#h]]\nem*\n===\n"],
  ["fuzz/wikilink/18", "> https://e.test/p\t<mailto:a@e.test>[[a#h]]\n"],
  ["fuzz/highlight/60", "> ![\n===\n"],
  [
    "fuzz/embed/108",
    "> [!note] **strong****, _![[d.pdf#page=3]]_ \\ [[a#^blk]]\n",
  ],
  ["fuzz/math/14", "** *$y^2\ny^2$*\n"],
  ["fuzz/highlight/61", "- **\n===\n"],
  ["fuzz/footnote/42", "[^1]: \n*em*\n"],
  ["fuzz/inline-footnote/26", ". ^[]\n"],
  ["fuzz/embed/109", "]](![[]]](**st\n"],
  ["fuzz/highlight/62", "> > !\n===\n"],
  ["fuzz/inline-footnote/27", "[^[[a#^blk]]] \n"],
  ["fuzz/highlight/63", "[[a|b]]\nimg.\n===\n"],
  ["fuzz/embed/110", "1. ![[img.png]] \\ [[a#h\\]], ![[[[target]]\n"],
  ["fuzz/embed/111", "![[[[a#h\\]]]]\n"],
  ["fuzz/table/16", "| # [[[[a#h a#h]]]\n"],
  ["fuzz/inline-footnote/28", "1. ^[i\n===\n"],
  ["fuzz/embed/112", "> ![[https://e.test/p]]\n[[[[a#^blk]]\n"],
  [
    "fuzz/embed/113",
    "| > [!note] ![[d.pdf#page=3]] | word, ^[inline] > [!note] x^2$\\![[img.png]]\t[[\n",
  ],
  ["fuzz/tag/9", "日本語\na#h]]\n---\n"],
  ["fuzz/embed/114", "$x^2$\n ![[^\n---\n"],
  ["fuzz/embed/115", " ![[#tag]]\n"],
  ["fuzz/highlight/64", "> >  . \n===\n"],
  ["fuzz/comment/12", "x^2$  [[a#^blk a#^blk]] %%note%% > <\n"],
  ["fuzz/embed/116", "1], ​\n![[i.\n===\n"],
  ["fuzz/block-ref/13", "  ==mar\n^blk [\n---\n"],
  ["fuzz/inline-footnote/29", "> > &amp;\t[^[^1]]^\n"],
  ["fuzz/setext/5", "<br>\n---\n"],
  ["fuzz/embed/117", "| [[a|b a|b]]![[]]]([link](u) | c |\n"],
  ["fuzz/callout/11", "> [!note] _under\nunder_\n"],
  ["fuzz/inline-footnote/30", "^[**strong**]\n"],
  ["fuzz/highlight/65", "> <ma\n===\n"],
  ["fuzz/inline-footnote/31", "(u)%% | [^[link](u)]\n"],
  ["fuzz/math/15", "日本語. \n$x^2\n---\n"],
  ["fuzz/html/22", "<div>\n> > ~~<br>~~\n"],
  ["fuzz/table/17", "| - <mailto:a@e.test> | \n"],
  ["fuzz/strikethrough/12", "\\ ~~~~\n"],
  ["fuzz/html/23", "- ~~~~del~~](<m\n"],
  ["fuzz/inline-footnote/32", "  ^[i.\n  $x^2$\n===\n"],
  ["fuzz/comment/13", "1. %%[\n===\n"],
  [
    "fuzz/embed/118",
    "> [!note] **![[![[img.png]]]]** \\ ![[[[a|b]]]]]([[target]] \\ *em*\n",
  ],
  ["fuzz/callout/12", "> [!note] ****strong**. *em** | [link](u)\n"],
  ["fuzz/strikethrough/13", "~del~~~~\n"],
  ["fuzz/embed/119", "> ![[i.png|100x200]]\n[[[^1]]]\n"],
  ["fuzz/embed/120", "![[img.\n~~de\n---\n"],
  ["fuzz/html/24", "- <mailto:a@e.test>\n"],
  ["fuzz/comment/14", "  [[#\note%%\n---\n"],
  [
    "fuzz/embed/121",
    "> [!note] _under_ \\ ![[d.pdf#page=3 \\ \\[[target]] _under_\n",
  ],
  ["fuzz/table/18", "| 1. ``code` | c |\n"],
  ["fuzz/highlight/66", "> [[a#\n===\n"],
  ["fuzz/embed/122", "[[``]] | ![[img.png]]\n  ![[[[`code``]]]] $x^2$\n"],
  ["fuzz/highlight/67", "1. !\n===\n"],
  ["fuzz/embed/123", "]]]( \t![[`code`]]\n- [ ] [link](u)\n"],
  ["fuzz/strikethrough/14", "]. ~~~~\n"],
  ["fuzz/embed/124", "  #tag ==mark==![[mark==]]\n|   [[target]] | c |\n"],
  ["fuzz/highlight/68", "~~del~~\n  _un\n===\n"],
  ["fuzz/footnote/43", "~. *[^<br>]*\n"],
  ["fuzz/embed/125", "> > ![[]]. <mailto:a@e.test>](<br>\n"],

  // Reduced by the fuzz shrinker from randomly composed documents, each the
  // smallest input that still disagreed with Obsidian. Minimal and distinct,
  // so they read as ordinary cases rather than as generated noise.
  ["fuzz/table/1", "| a \n| --- \n"],
  ["fuzz/block-ref/1", "^blk\n"],
  ["fuzz/embed/1", "![[d.pdf#page=3]]\n"],
  ["fuzz/block-ref/2", " ^blk\n"],
  ["fuzz/embed/2", "- ![[d.pdf#page=3]]\n"],
  ["fuzz/html/1", "<mailto:a@e.test>\n"],
  ["fuzz/embed/3", "> ![[d.pdf#page=3]]\n"],
  ["fuzz/html/2", "<div>\n&amp;\n"],
  ["fuzz/highlight/1", "- [ ]\n===\n"],
  ["fuzz/footnote/1", "[^1]: # \n"],
  ["fuzz/embed/4", "- [ ] ![[d.pdf#page=3]]\n"],
  ["fuzz/block-ref/3", "# ^blk\n"],
  ["fuzz/embed/5", "  ![[img.png]]\t[[a|b]]\n"],
  ["fuzz/block-ref/4", "> ^blk\n"],
  [
    "fuzz/block-ref/5",
    "> [!note] <mailto:a@e.test><https://e.test> ^blk$x^2$\n",
  ],
  ["fuzz/inline-footnote/1", "# ^[^[inline]!\n"],
  ["fuzz/highlight/2", "- $x\n===\n"],
  ["fuzz/inline-footnote/2", "$x^2$\n[[^[^\n===\n"],
  ["fuzz/comment/1", "> %%n\n===\n"],
  ["fuzz/table/2", "  [[\\[[a|b]]]]\n"],
  ["fuzz/callout/1", "> [!\n===\n"],
  ["fuzz/footnote/2", "[^1]: #\n"],
  ["fuzz/html/3", "> > <mailto:a@e.test>\n"],
  ["fuzz/setext/1", "-  *em*\n<br>\n](u)\n---\n"],
  ["fuzz/highlight/3", "- ![\n===\n"],
  ["fuzz/wikilink/1", "[[[](u)]]\n"],
  ["fuzz/highlight/4", "  ==`code`== | ​\n"],
  ["fuzz/table/3", "a#h]] | <mailto:a@e.test>\n"],
  [
    "fuzz/inline-footnote/3",
    "| # [[a|b # [^^blk] [^[^1] [^1]\t1] # [[a#^blk\n",
  ],
  ["fuzz/footnote/3", "[^1]: # ​\n"],
  ["fuzz/footnote/4", "([^_under_]\n"],
  ["fuzz/footnote/5", "[^1]: # ![\n"],
  ["fuzz/callout/2", "> [!note] ****strong** | #a/b\n"],
  ["fuzz/misc/1", "- [ \n</div>\n"],
  ["fuzz/callout/3", "> [!note] <mailto:a@e.test>\n"],
  ["fuzz/comment/2", "> %%note%% \\ [[a#^blk](target]] %%==mark==%%\n"],
  ["fuzz/comment/3", "%<br>%%\n"],
  ["fuzz/callout/4", "> [!note]  \n"],
  ["fuzz/wikilink/2", "> > https://e.test/p]([[[[&amp;]]]]\n"],
  ["fuzz/embed/6", "  ![[img.png]] [[!\n> [!note] \\![[i.png|100x200]]\n"],
  ["fuzz/highlight/5", "> > [\n===\n"],
  ["fuzz/footnote/6", "> > [^$\n===\n"],
  ["fuzz/highlight/6", "- 日本語\n===\n"],
  ["fuzz/strikethrough/1", "~~~. [\n"],
  ["fuzz/embed/7", "> ![[[^1]]]%%%%\n[[~~del~~]]\n"],
  ["fuzz/math/1", "- ~~$x^2$~~](<mailto:a@e.test> `code``\n"],
  ["fuzz/tag/1", "  #tag. <mailto:a@e.test>\n"],
  ["fuzz/emphasis/1", "_under_^blk\n"],
  ["fuzz/embed/8", "> ![[_under_]]\n[[[[under_]]]]](wor\n"],
  ["fuzz/highlight/7", "> > #a/b\n===\n"],
  ["fuzz/math/2", "$y^2$\n&amp;\n"],
  ["fuzz/tag/2", "]]\t#t\n"],
  ["fuzz/html/4", "- [ ] <mailto:a@e.test>\n"],
  ["fuzz/highlight/8", "- [ ]  \n===\n"],
  ["fuzz/embed/9", "- $$![[img.png]]]]$$]([[a|b\\]]\n===\n"],
  ["fuzz/math/3", "- $y^2$~~<mailto:a@e.test>~~\n"],
  ["fuzz/embed/10", "# ![[#tag]]\n"],
  ["fuzz/wikilink/3", "<div>\n> [[<mailto\n"],
  ["fuzz/setext/2", "  wor\n1]](\n---\n"],
  ["fuzz/embed/11", "#tag](![[d.pdf#page=3]]**strong**\n"],
  ["fuzz/wikilink/4", "]]. [[a#h\\]]\n"],
  ["fuzz/footnote/7", "# [^1[[a#^blk\\]]#tag\n"],
  ["fuzz/entity/1", " &amp\n"],
  ["fuzz/embed/12", "  [^1\\]\n  ![[![\n"],
  ["fuzz/inline-footnote/4", "[^[[a#\n\\[^1]\n"],
  ["fuzz/highlight/9", "1. `\n===\n"],
  ["fuzz/embed/13", "1. [![[[[a#h]]]]](u) \\ <br>\n"],
  ["fuzz/footnote/8", "[^1]: # ~\n"],
  ["fuzz/highlight/10", "> > $x^2$\n===\n"],
  ["fuzz/html/5", "- <mailto:a@e.test>!\n"],
  ["fuzz/wikilink/5", "<div>\n[[<ma\n"],
  ["fuzz/embed/14", "> > ![[#\n===\n"],
  ["fuzz/footnote/9", "00]]] | %%[[<br>]]%% \\ [^1]\n"],
  ["fuzz/table/4", "~~de\na|b]]\n---\n"],
  ["fuzz/embed/15", "# [link](u)![[d.pdf#page=3]]\n"],
  ["fuzz/block-ref/6", "]]  ^bl\n"],
  ["fuzz/embed/16", "- 日本語](![[d.pdf#page=3]] | [^1]\n"],
  ["fuzz/embed/17", "![[i.png|100]]\n[[target]] _\n"],
  ["fuzz/embed/18", ". 日本語, _[[![[i.png|100]]]]_\n# `code`[[a#^blk]]]]\n"],
  ["fuzz/embed/19", "> > [[target]]](![[i.png|100 | *[[&amp;]]*\n"],
  [
    "fuzz/embed/20",
    "| a#^blk]] | ![[d.pdf#page=3]] ^[inline\\] ^[**\\`code`\n",
  ],
  ["fuzz/embed/21", "1. ![[<br>]]\nu). [[a#h]]\n"],
  ["fuzz/wikilink/6", "[[a#^blk\\]]. ​, 日本語\n"],
  ["fuzz/comment/4", "- [ ] 日本語\t%%[link](u)%% | [[a#^blk\n"],
  ["fuzz/highlight/11", "1. [[\n===\n"],
  ["fuzz/highlight/12", "1. **st\n===\n"],
  ["fuzz/footnote/10", "[^1](u)\n"],
  ["fuzz/embed/22", "[^1]: - ![[[[a|b]]]]](^[[[a#h]]]\n"],
  ["fuzz/embed/23", "1. ![[#a/b]]\n"],
  ["fuzz/embed/24", "%% | ![[==mark==]], [[target]]\n"],
  ["fuzz/footnote/11", "[^$$$]\n"],
  [
    "fuzz/embed/25",
    "- i.png|100]]](![[d.pdf#page=3]]]] #a/b ![[i.png|100x200]]\n",
  ],
  ["fuzz/embed/26", "# &amp; [^![[img.png]]] [[target\\]]\n"],
  ["fuzz/highlight/13", "> <m\n===\n"],
  ["fuzz/highlight/14", "> _u\n===\n"],
  ["fuzz/inline-footnote/5", "1. [^[[a#^blk]]]\n"],
  ["fuzz/html/6", "- [ ] <mailto:a@e.test>, __under_under_\n"],
  ["fuzz/embed/27", "- ![[![[d.pdf#page=3]]]] \\ [[a#^blk\n"],
  ["fuzz/inline-footnote/6", "lk\\]]]]. [^[[target]]]\n"],
  ["fuzz/embed/28", "- ![[a\n</div>\n"],
  ["fuzz/embed/29", "^![[d.pdf#page=3]]]\n"],
  ["fuzz/embed/30", "![[d.pdf#page=3\\]]\n"],
  ["fuzz/footnote/12", "[^1]: - [ ] `code`\t#a/b[[a|b]]\n"],
  ["fuzz/footnote/13", "[^&amp;]\n"],
  ["fuzz/table/5", "| 1. ~~del\\~~ [[]] | c |\n"],
  ["fuzz/misc/2", "> [li\n \n"],
  ["fuzz/embed/31", "![[<br>]], %%note\t[[a|b]]\n"],
  ["fuzz/wikilink/7", "- [ ] <mailto:a@e.test>. [[]]\n"],
  ["fuzz/inline-footnote/7", ". 日本語, ^[] | c |\n"],
  ["fuzz/comment/5", "  %%[[target]]%%\n"],
  ["fuzz/embed/32", "> > [[a#^blk]] \\ [^[[![[i.png|100]]]]]\t[[a#h]]\n"],
  ["fuzz/embed/33", "- *​*. *em* | ![[d.pdf#page=3]]\n"],
  ["fuzz/footnote/14", "[^1]: >\nx200]]\n"],
  ["fuzz/html/7", "<mailto:a@e.test>&amp;. code`\n"],
  ["fuzz/embed/34", "> > ![[]]\n===\n"],
  ["fuzz/math/4", "# https://e.test/p]($y^2$]([[#tag]] a#h]]\n"],
  ["fuzz/highlight/15", "​\n[link\n===\n"],
  ["fuzz/embed/35", " ![[d.pdf#page=3]]\n"],
  ["fuzz/tag/3", ">\t#ta\n"],
  ["fuzz/highlight/16", "1. [[]]\n===\n"],
  ["fuzz/callout/5", "> [!n\n===\n"],
  ["fuzz/embed/36", "![[![[d.pdf#page=3]] [[[[\n"],
  [
    "fuzz/highlight/17",
    "- [ ] ==&amp;==, [[==[[target]]==]]. **strong**\t[[[[]]]]\n",
  ],
  ["fuzz/highlight/18", "> > `\n===\n"],
  ["fuzz/embed/37", "  ![[[[a#h\\]]]]\n"],
  ["fuzz/embed/38", "![[d.pdf#page=3]], [​](u)\n"],
  ["fuzz/html/8", "<div>\n<http\n"],
  ["fuzz/math/5", "> <br>\n$$\t[\n"],
  ["fuzz/inline-footnote/8", "3]]^[[[a#^blk\\]]]\n"],
  ["fuzz/tag/4", "```\n```\n\n> #a/\n"],
  ["fuzz/footnote/15", "| - $x^2$. [^%%note%%%%] \n"],
  ["fuzz/footnote/16", "[^1]: # [[]]\n"],
  ["fuzz/inline-footnote/9", "  ^[i\n  [[\n---\n"],
  ["fuzz/highlight/19", "*em*\n    \\_\n===\n"],
  ["fuzz/highlight/20", "1. [[[\n===\n"],
  ["fuzz/highlight/21", "> > [[\n===\n"],
  ["fuzz/embed/39", "1. [[![[i.png|100x200]]]]\n[[a|b]]\n"],
  ["fuzz/strikethrough/2", "- ~~~~del~~`code`\n"],
  ["fuzz/inline-footnote/10", "- ^[*em*]\n"],
  ["fuzz/html/9", "<div>\n`. &amp;\n"],
  ["fuzz/block-ref/7", "  #a/b \n^2\\$\n===\n"],
  ["fuzz/math/6", "]]. <mailto:a@e.test>\t$x^2\n"],
  ["fuzz/embed/40", "# **![[img.png]]**\n[[a#h]]\n"],
  ["fuzz/highlight/22", "=3]]]\n&amp;\n===\n"],
  ["fuzz/comment/6", "%%[[a#h]]%%\n"],
  ["fuzz/highlight/23", "> > [[[[a\n===\n"],
  ["fuzz/callout/6", "> [!note] [[a#^blk\\]][[[\n"],
  ["fuzz/table/6", "/b` ~~~~ | c |\n"],
  ["fuzz/embed/41", "> > ![[d.pdf#page=3]],\n"],
  ["fuzz/embed/42", "> [!note] 日本語](_==![[i\n===\n"],
  ["fuzz/math/7", "```\n```\n\n- $y^\n"],
  ["fuzz/strikethrough/3", "~~del\\~~\n"],
  ["fuzz/embed/43", "```js\n```\n> > ![[ ]]\n"],
  ["fuzz/highlight/24", "1. ==\n===\n"],
  ["fuzz/embed/44", "![[ ]]\n===\n"],
  ["fuzz/highlight/25", "| - #tag | 日本語 ~~del\\~~==mark== | c |\n"],
  ["fuzz/table/7", "| > #a/b [[a#^blk\\]]\t​\n"],
  ["fuzz/highlight/26", "- [li\n===\n"],
  ["fuzz/embed/45", "1. ![[i.png|100\\]]\n1. [[a|b]]\n"],
  ["fuzz/comment/7", "g]]%%*#tag*\t%%note%%\n"],
  ["fuzz/strikethrough/4", "- *~~~~del~~*\n"],
  ["fuzz/highlight/27", "> > 日本語\n===\n"],
  ["fuzz/embed/46", "[^1]: > [!note] ![[[[word]]]] \n[^1]: - [^1] \n"],
  ["fuzz/misc/3", "- [ ]\n</div>\n"],
  ["fuzz/embed/47", "​ | ![[d.pdf#page=3]]\n"],
  ["fuzz/embed/48", "*![[d.pdf#page=3]]*\n"],
  ["fuzz/highlight/28", "mark==](u)](<mailto:a@e.test>, word $^blk$\n"],
  ["fuzz/comment/8", "%%note%%\t日本語\n$y^2$\n---\n"],
  ["fuzz/wikilink/8", "[[&am\n    [[link](u)]]\n"],
  ["fuzz/math/8", "**$y^2\ny^2$\n---\n"],
  ["fuzz/block-ref/8", "  ^blk](![[d.pdf#page=3]]\n"],
  ["fuzz/strikethrough/5", ">\t~~~~\n"],
  ["fuzz/embed/49", "| # ![[[link](u)]] # <mailt\n"],
  ["fuzz/strikethrough/6", "- [~~~~del\n"],
  ["fuzz/highlight/29", "\\[[a\n#a/b\n===\n"],
  ["fuzz/wikilink/9", "[[]]](\n"],
  ["fuzz/highlight/30", "_under\n\\$y\n===\n"],
  ["fuzz/embed/50", "> [!note] *![[d.pdf#page=3]]]]*](#a/b\n"],
  ["fuzz/footnote/17", "#  ]([^&amp;]\n"],
  [
    "fuzz/embed/51",
    "# [[target]]. ![[i.png|100]] \\ *$$y^2$*\n# %%%%, [link](u). ![[[^1]]]![[]]\n",
  ],
  ["fuzz/footnote/18", "[^1]: -\ny^2$\n"],
  ["fuzz/html/10", "ink](u) \\ <mailto:a@e.test>\n"],
  ["fuzz/inline-footnote/11", "- ^[i\ne]#a/b\n"],
  ["fuzz/embed/52", "- [ ] [[<br>]]\t![[d.pdf#page=3]]\n"],
  ["fuzz/highlight/31", "- [[[\n===\n"],
  ["fuzz/embed/53", "[[^![[]]]](\n"],
  ["fuzz/inline-footnote/12", "^[[a#^b\na#h]\n---\n"],
  ["fuzz/embed/54", "[a#h]]![[d.pdf#page=3]]\n"],
  ["fuzz/highlight/32", "- [ ] [\n===\n"],
  ["fuzz/callout/7", "> [!not\n===\n"],
  ["fuzz/strikethrough/7", "** ~~del\\~~\n"],
  ["fuzz/embed/55", "![[#tag]]\n"],
  ["fuzz/highlight/33", "1. &\n===\n"],
  ["fuzz/table/8", "[[[[a|\n    ~\n---\n"],
  ["fuzz/embed/56", "[^1]: > > <ma\n    target]]. [![[#tag]]](u), 日本語\n"],
  ["fuzz/html/11", "  <mailto:a@e.test>\n"],
  ["fuzz/inline-footnote/13", "^[in\n   , _\n===\n"],
  ["fuzz/embed/57", "> > ​ ![[d.pdf#page=3]] \\ %%note%%\n"],
  ["fuzz/inline-footnote/14", "# ^[^[inline]\t<\n"],
  ["fuzz/footnote/19", "  [^1]\n1]\n===\n"],
  ["fuzz/highlight/34", "- [ ] $_under_$\n===\n"],
  ["fuzz/highlight/35", "  [[ta\n  **str\n===\n"],
  ["fuzz/embed/58", "_under_\t![[strong**]]\n[link\n](u) \n"],
  ["fuzz/math/9", "> > $`code\n"],
  ["fuzz/footnote/20", "1. [^1]\n===\n"],
  ["fuzz/highlight/36", "under\ny^2$\n===\n"],
  ["fuzz/block-ref/9", "^blk, ![[![[d.pdf#page=3]]\n"],
  ["fuzz/footnote/21", ". ==[[^blk]]==\n"],
  ["fuzz/wikilink/10", "[[a#^blk]]\t~~~~, <br>, `code`\n"],
  ["fuzz/html/12", "# <mailto:a@e.test>\t<br>. *em*\n"],
  ["fuzz/footnote/22", "[^1]: >\n]](a#\n"],
  ["fuzz/table/9", "```js\n```\n\n| a \n| --- \n"],
  ["fuzz/footnote/23", "> [^1]\nilto:a@\n---\n"],
  ["fuzz/math/10", "- [ ] $y\n"],
  ["fuzz/table/10", "| > ``code` \n"],
  ["fuzz/comment/9", "- %%\nnote%%\n"],
  ["fuzz/strikethrough/8", "l~~~~\n"],
  ["fuzz/embed/59", "![[img.\nword, [\n---\n"],
  ["fuzz/embed/60", "<br>. ![[d.pdf#page=3]]\n"],
  ["fuzz/inline-footnote/15", "[^1]: > >\na/b^[\n"],
  ["fuzz/footnote/24", "[[$x^2$]]\t[^https://e.test/p]\n"],
  ["fuzz/highlight/37", "> > wor\n===\n"],
  ["fuzz/footnote/25", "[^1]: # ~~\n"],
  [
    "fuzz/embed/61",
    "|   target]] | mark==, [[![[https://e.test/p]]]]$y^2$   ![[d.pdf#page=3 d.pdf#page=3]]]([[[[[[target]]]]]]. _[[a#^blk]]_   [[a|b]]\t日本語 | c |\n",
  ],
  ["fuzz/tag/5", "ng]]\t#a/b]\n"],
  ["fuzz/highlight/38", "[[a#h\n    ^\n===\n"],
  ["fuzz/footnote/26", " [[`[^1]`]]\n"],
  ["fuzz/misc/4", "1. 日本語\n</div>\n"],
  ["fuzz/wikilink/11", "- [[a#h]]\t#tag. <ma\n"],
  ["fuzz/embed/62", "  ![[img.png]]\n[[a#^blk]]\n"],
  ["fuzz/highlight/39", "> > ==\n===\n"],
  ["fuzz/html/13", "<div>\nd\t&amp;\n"],
  ["fuzz/tag/6", "**\t#a/b\n"],
  ["fuzz/embed/63", "> ![[![[d.pdf#page=3]]]]\n"],
  ["fuzz/math/11", "$y^2$\n#tag\n"],
  ["fuzz/html/14", "> <mailto:a@e.test>\n"],
  ["fuzz/tag/7", "語\t#a/b\n"],
  ["fuzz/highlight/40", "> `code\n===\n"],
  ["fuzz/table/11", "| 1. <mailto:a@e.test>  $x^2\n"],
  ["fuzz/highlight/41", "> #a\n===\n"],
  ["fuzz/embed/64", "  ](![[ ]]\n> [!note] $**strong**$ ^[i\n"],
  ["fuzz/embed/65", "$x^2$![[![[d.pdf#page=3]]\n"],
  ["fuzz/setext/3", "  http\n  _u\n---\n"],
  ["fuzz/tag/8", "rd\t#tag\n"],

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
