/**
 * Deterministic Obsidian-parity corpus.
 *
 * Layered rather than random, because random bytes almost never hit a delimiter
 * boundary: normative seeds, then a token grammar crossed with delimiter states,
 * then structural splicing into contexts that shield or reparse markdown, then
 * adjacency mutations around closing delimiters.
 */

import { HUNT_FIXTURES } from "./corpus-hunt.js";

export type Layer = "seed" | "token" | "context" | "adjacency" | "hunt";

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

export function buildCorpus(): Case[] {
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

  for (const fixture of HUNT_FIXTURES) {
    push(fixture.id, "hunt", fixture.category, fixture.markdown);
  }

  return cases;
}

/** Vault-safe filename for a case id. */
export function caseFileName(id: string): string {
  return `${id.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")}.md`;
}
