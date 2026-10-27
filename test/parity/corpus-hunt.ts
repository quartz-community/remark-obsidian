/**
 * Structural fixtures harvested from the `test/hunt/` regression pins of
 * {@link https://github.com/Comprehensive-Jason/obsidian-footnotes obsidian-footnotes}
 * (MIT; see LICENSE-THIRD-PARTY.md). That project hand-rolls an Obsidian-matching
 * scanner and pins every bug it ever found, so its fixtures concentrate on the
 * block-structure edges a generated corpus does not reach: fences dying with their
 * container, lazy continuation, setext underlines, indented code after a quote,
 * HTML blocks in containers, and link reference definitions next to footnotes.
 *
 * Generated, not hand-written. Each id names the pin it came from. Only whole
 * documents were taken, deduped against the generated corpus; test titles and
 * single-line fragments were dropped.
 */

export const HUNT_FIXTURES: ReadonlyArray<{
  readonly id: string;
  readonly category: string;
  readonly markdown: string;
}> = [
  {
    id: "hunt/aftercloser-chain-eats-referenced-definition/0",
    category: "comment",
    markdown: "%%\nhidden\n%% [^a]: sees [^b]\n\n[^b]: b body\n\ntail\n",
  },
  {
    id: "hunt/aftercloser-chain-eats-referenced-definition/1",
    category: "comment",
    markdown: "%%\nhidden\n%% [^a]: def\n\ntail\n",
  },
  {
    id: "hunt/aftercloser-duplicate-silent/0",
    category: "comment",
    markdown:
      "use[^d] here\n\n%%\nhidden\n%% [^d]: after the closer\n\n[^d]: second\n",
  },
  {
    id: "hunt/aftercloser-duplicate-silent/1",
    category: "footnote",
    markdown: "use[^d]\n\n[^d]: one\n\n[^d]: two\n",
  },
  {
    id: "hunt/aftercloser-duplicate-silent/2",
    category: "comment",
    markdown: "use[^d]\n\n%%\nhidden\n%% [^d]: after the closer\n",
  },
  {
    id: "hunt/aftercloser-orphan-silent/0",
    category: "comment",
    markdown: "%%\nhidden\n%% [^1]: def\n",
  },
  {
    id: "hunt/aftercloser-orphan-silent/1",
    category: "comment",
    markdown: "%%\nhidden\n%% [^1]: def\n\nuse[^1]\n",
  },
  {
    id: "hunt/apply-prefix-skips-quoted-numbered-orphan/0",
    category: "blockquote",
    markdown:
      "---\nfootnote-prefix: 2.\n---\n\nsee[^5] here\n\n> [^5]: inside a quote\n",
  },
  {
    id: "hunt/backticked-comment-opener/0",
    category: "html-comment",
    markdown: "`<!--` is sample syntax\nreal[^7]\n\n[^7]: seven\n",
  },
  {
    id: "hunt/bare-fence-after-blockquote-fence/0",
    category: "fenced-code",
    markdown: "> ```\n> fake[^7]\n```\nreal[^1]\n",
  },
  {
    id: "hunt/blockquote-closes-bare-fence/0",
    category: "fenced-code",
    markdown: "```\ncode\n> ```\nreal[^1]\n",
  },
  {
    id: "hunt/blockquote-closes-bare-fence/1",
    category: "fenced-code",
    markdown: "~~~\ncode\n> ~~~\nreal[^1]\n",
  },
  {
    id: "hunt/blockquote-fence-outlives-quote/0",
    category: "fenced-code",
    markdown: "> ```\n> sample[^99]\n\noutside the quote[^7]\n",
  },
  {
    id: "hunt/blockquote-fence-outlives-quote/1",
    category: "fenced-code",
    markdown: "> ```\n> sample[^99]\n\nbody[^1]\n\n[^1]: one\ntail\n",
  },
  {
    id: "hunt/blockquote-fence-unprotected/0",
    category: "fenced-code",
    markdown: "> ```\n> fake[^7]\n> ```\nreal[^1]\n",
  },
  {
    id: "hunt/blockquote-fence-unprotected/1",
    category: "fenced-code",
    markdown: "> [!note]\n> ```\n> fake[^7]\n> ```\nreal[^1]\n",
  },
  {
    id: "hunt/blockquote-region-outlives-quote/0",
    category: "blockquote",
    markdown: "> $$\n> x = 1\n\nafter[^1]\n\n[^1]: def\n",
  },
  {
    id: "hunt/blockquote-region-outlives-quote/1",
    category: "blockquote",
    markdown: "> <!--\n> draft\n\nafter[^1]\n",
  },
  {
    id: "hunt/blockquote-region-outlives-quote/2",
    category: "blockquote",
    markdown: "> $$\nlazy[^1]\n",
  },
  {
    id: "hunt/blockquote-region-outlives-quote/3",
    category: "footnote",
    markdown: "$$\nx\n\nswallowed[^1]\n",
  },
  {
    id: "hunt/blockquote-region-outlives-quote/4",
    category: "blockquote",
    markdown: "> $$\n> x\n",
  },
  {
    id: "hunt/blockquote-setext-residue/0",
    category: "blockquote",
    markdown: "> closing words[^1]\n[^9]: orphan\n> ---\n\n[^1]: used\n",
  },
  {
    id: "hunt/blockquoted-label-counted-as-reference/0",
    category: "blockquote",
    markdown: "> [^9]: quoted orphan\n\ntext[^5]\n\n[^5]: five\n",
  },
  {
    id: "hunt/blockquoted-label-counted-as-reference/1",
    category: "blockquote",
    markdown: "> [^1]: quoted orphan\n\ntext[^5]\n\n[^5]: five\n",
  },
  {
    id: "hunt/case-insensitive-footnote-ids/0",
    category: "footnote",
    markdown: "Alpha[^Note].\n\n[^note]: the definition text\n",
  },
  {
    id: "hunt/closer-line-duplicate-silent/0",
    category: "comment",
    markdown:
      "text[^d] here\n\n%%\nhidden\n%% [^d]: first body\n\n[^d]: second body\n",
  },
  {
    id: "hunt/closer-line-duplicate-silent/1",
    category: "footnote",
    markdown: "x[^d]\n\n[^d]: one\n[^d]: two\n",
  },
  {
    id: "hunt/code-span-crosses-heading/0",
    category: "footnote",
    markdown: "# `code[^1]\nspan` tail\n\nuse[^2]\n\n[^1]: def\n[^2]: other\n",
  },
  {
    id: "hunt/code-span-crosses-heading/1",
    category: "footnote",
    markdown: "# `code[^1]\nspan` tail\n",
  },
  {
    id: "hunt/code-span-crosses-heading/2",
    category: "footnote",
    markdown: "a `code[^1]\nspan` tail\n",
  },
  {
    id: "hunt/code-span-crosses-quote-continuation/0",
    category: "blockquote",
    markdown: "> `code[^1]\n> span` tail\n\nuse[^2]\n\n[^2]: def\n",
  },
  {
    id: "hunt/code-span-crosses-quote-continuation/1",
    category: "blockquote",
    markdown: "> `code[^1]\n> span` tail\n",
  },
  {
    id: "hunt/code-span-crosses-quote-continuation/2",
    category: "blockquote",
    markdown: "a `code[^1]\n> quoted\nspan` tail\n",
  },
  {
    id: "hunt/code-span-fence-info-backtick/0",
    category: "fenced-code",
    markdown: "para `code [^1]\n``` `x`\n",
  },
  {
    id: "hunt/column-zero-callout-title/0",
    category: "blockquote",
    markdown: "a[^1]\n\n> [!note]\n> [^1]: mid\n",
  },
  {
    id: "hunt/column-zero-callout-title/1",
    category: "blockquote",
    markdown: "a[^1]\n\n> [!note]- Folded\n> [^1]: mid\n",
  },
  {
    id: "hunt/column-zero-callout-title/2",
    category: "blockquote",
    markdown: "a[^1]\n\n> [!note]\n> body\n> [^1]: mid\n",
  },
  {
    id: "hunt/column-zero-callout-title/3",
    category: "footnote",
    markdown: "a[^1]\n[!note] not a callout\n[^1]: mid\n",
  },
  {
    id: "hunt/column-zero-callout-title/4",
    category: "footnote",
    markdown: "a[^1]\n[![badge](img.svg)](https://ci.example)\n[^1]: mid\n",
  },
  {
    id: "hunt/column-zero-callout-title/5",
    category: "footnote",
    markdown: "use[^1]\n[![badge](img.svg)](https://ci.example)\n[^1]: real\n",
  },
  {
    id: "hunt/column-zero-callout-title/6",
    category: "footnote",
    markdown:
      "[![badge](img.svg)](https://ci.example)\n[^1]: plain text, not a definition\n",
  },
  {
    id: "hunt/comment-boundary-lines/0",
    category: "html-comment",
    markdown: "a[^7] <!-- draft\n--> done[^6]\n",
  },
  {
    id: "hunt/comment-boundary-lines/1",
    category: "html-comment",
    markdown: "a <!-- draft\n--> done[^7]\n",
  },
  {
    id: "hunt/comment-boundary-lines/2",
    category: "html-comment",
    markdown: "x[^9] <!-- hidden\n--> y[^8]\n\n[^8]: eight\n[^9]: nine\n",
  },
  {
    id: "hunt/comment-boundary-lines/3",
    category: "html-comment",
    markdown: "x[^1] <!-- hidden\n--> y[^2]\n\n[^1]: nine\n[^2]: eight\n",
  },
  {
    id: "hunt/comment-boundary-lines/4",
    category: "html-comment",
    markdown: "a[^1]. <!-- draft\n--> b\n",
  },
  {
    id: "hunt/comment-boundary-lines/5",
    category: "html-comment",
    markdown: "a [^5] <!-- draft\nstill comment\n--> done\n",
  },
  {
    id: "hunt/comment-closer-label-is-live/0",
    category: "html-comment",
    markdown: "text[^1] here\n\n<!--\n[^1]: one\n[^2]: two -->\n\ntail\n",
  },
  {
    id: "hunt/comment-mask-order/0",
    category: "html-comment",
    markdown: "<!-- [^9] `--> `\nreal[^2]\n",
  },
  {
    id: "hunt/commented-label-before-closer-silent/0",
    category: "comment",
    markdown: "%%\n[^1]: dead %%\ntail\n",
  },
  {
    id: "hunt/commented-label-before-closer-silent/1",
    category: "blockquote",
    markdown: "> %%\n> [^1]: dead %%\n> tail\n",
  },
  {
    id: "hunt/commented-label-before-closer-silent/2",
    category: "comment",
    markdown: "%%\nhidden\n%% [^3]: def\n",
  },
  {
    id: "hunt/commented-label-before-closer-silent/3",
    category: "comment",
    markdown: "%%\n[^1]: dead\ntail\n%%\n",
  },
  {
    id: "hunt/commented-section-heading-anchors-append/0",
    category: "comment",
    markdown: "x[^1]\n\n[^1]: one\n\n%%\n# Footnotes\n%%\n\ntail\n",
  },
  {
    id: "hunt/commented-section-heading-anchors-append/1",
    category: "footnote",
    markdown: "\n\n# Footnotes\n\n[^1]: \n",
  },
  {
    id: "hunt/commented-section-heading-anchors-append/2",
    category: "html-comment",
    markdown: "x[^1]\n\n[^1]: one\n\n<!--\n# Footnotes\n-->\n\ntail\n",
  },
  {
    id: "hunt/continuation-masked-under-foreign-label/0",
    category: "indented-code",
    markdown:
      "b[^2] a[^1].\n\n[foo]: /url\n[^1]: body cites [^2]\n\n    code [^2]\n\n[^2]: two\n[^1]: one\n",
  },
  {
    id: "hunt/continuation-masked-under-foreign-label/1",
    category: "indented-code",
    markdown:
      "b[^2] a[^1].\n\n| a | b |\n| --- | --- |\n[^1]: body cites [^2]\n\n    code [^2]\n\n[^2]: two\n[^1]: one\n",
  },
  {
    id: "hunt/continuation-masked-under-foreign-label/2",
    category: "indented-code",
    markdown:
      "b[^2] a[^1].\n\n%%\nhidden\n%% [^1]: body cites [^2]\n\n    code [^2]\n\n[^2]: two\n[^1]: one\n",
  },
  {
    id: "hunt/continuation-masked-under-foreign-label/3",
    category: "indented-code",
    markdown:
      "b[^2] a[^1].\n\n[^1]: body cites [^2]\n\n    code [^2]\n\n[^2]: two\n[^1]: one\n",
  },
  {
    id: "hunt/crlf-protection/0",
    category: "setext",
    markdown: "---\r\nnum: [^9]\r\n---\r\nreal[^1]\n",
  },
  {
    id: "hunt/crlf-protection/1",
    category: "setext",
    markdown: "---\r\nfootnote-prefix: 2.\r\n---\r\nbody\n",
  },
  {
    id: "hunt/definition-block-ignores-code-span-interior/0",
    category: "footnote",
    markdown: "x[^1] para\n\n[^1]: a `code\nmore [^2] fake\nspan`\n\ntail\n",
  },
  {
    id: "hunt/definition-block-ignores-code-span-interior/1",
    category: "footnote",
    markdown: "x[^1] para\n\n[^1]: a `code` fine\n\ntail\n",
  },
  {
    id: "hunt/definition-block-ignores-code-span-interior/2",
    category: "html-comment",
    markdown: "x[^1] para\n\n[^1]: a <!--\nmore [^2] fake\n-->\n\ntail\n",
  },
  {
    id: "hunt/definition-block-owns-region-opener/0",
    category: "indented-code",
    markdown: "x[^1] y[^2]\n\n[^1]: one\n    %%\nhidden[^2] text\n%%\n\ntail\n",
  },
  {
    id: "hunt/definition-block-owns-region-opener/1",
    category: "indented-code",
    markdown:
      "x[^1] y[^2]\n\n[^1]: one\n    <!--\nhidden[^2] text\n-->\n\ntail\n",
  },
  {
    id: "hunt/definition-block-owns-region-opener/2",
    category: "indented-code",
    markdown: "b[^2] a[^1]\n\n[^1]: one\n    %%\nhidden\n%%\n[^2]: two\n",
  },
  {
    id: "hunt/definition-block-owns-region-opener/3",
    category: "indented-code",
    markdown: "b[^2] a[^1]\n\n[^1]: one\n    <!--\nhidden\n-->\n[^2]: two\n",
  },
  {
    id: "hunt/definition-block-owns-region-opener/4",
    category: "indented-code",
    markdown: "a[^1]\n\n[^9]: orphan\n    %%\n[^1]: one\n%%\n",
  },
  {
    id: "hunt/definition-block-owns-region-opener/5",
    category: "indented-code",
    markdown: "a[^1]\n\n[^9]: orphan\n    <!--\n[^1]: one\n-->\n",
  },
  {
    id: "hunt/definition-block-region-split/0",
    category: "indented-code",
    markdown:
      "top[^1]\n\n[^1]: formula\n    $$\n    E = mc^2\n    $$\n\ntail\n",
  },
  {
    id: "hunt/definition-block-region-split/1",
    category: "indented-code",
    markdown: "x[^1]\n\n[^1]: note\n    <!--\n    hidden\n    -->\n\nafter\n",
  },
  {
    id: "hunt/definition-block-region-split/2",
    category: "indented-code",
    markdown: "x[^1]\n\n[^1]: a\n    $$\n    E\n    $$\n\n    tail\n",
  },
  {
    id: "hunt/definition-chunk-after-ender/0",
    category: "indented-code",
    markdown: "[^116]: body\ncont\n===\n\n    indented code[^73]\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/0",
    category: "setext",
    markdown: "t[^1]\n\nH\n===\n[^1]: real\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/1",
    category: "footnote",
    markdown: "t[^1]\n\nH\n=\n[^1]: real\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/2",
    category: "setext",
    markdown: "t[^1]\n\nH\n---\n[^1]: real\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/3",
    category: "setext",
    markdown: "t[^1]\n\nH\n--\n[^1]: real\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/4",
    category: "footnote",
    markdown: "t[^1]\n\nH\n-\n[^1]: real\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/5",
    category: "footnote",
    markdown: "use[^1] here\n\nHeading\n-\n[^1]: real definition\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/6",
    category: "footnote",
    markdown: "t[^1]\npara\n# H\n[^1]: real\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/7",
    category: "footnote",
    markdown: "t[^1]\npara\n## H ##\n[^1]: real\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/8",
    category: "footnote",
    markdown: "t[^1]\npara\n___\n[^1]: real\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/9",
    category: "footnote",
    markdown: "t[^1]\npara\n***\n[^1]: real\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/10",
    category: "footnote",
    markdown: "t[^1]\npara\n # H\n[^1]: real\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/11",
    category: "footnote",
    markdown: "t[^1]\npara\n   # H\n[^1]: real\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/12",
    category: "footnote",
    markdown: "t[^1]\npara\n   ___\n[^1]: real\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/13",
    category: "footnote",
    markdown: "t[^1]\npara\n  ***\n[^1]: real\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/14",
    category: "footnote",
    markdown: "t[^1]\n\nH\n  ===\n[^1]: real\n",
  },
  {
    id: "hunt/definition-starts-misses-block-enders/15",
    category: "footnote",
    markdown: "use[^1]\npara\n   # Heading\n[^1]: real\n",
  },
  {
    id: "hunt/diff-fold-eof-replacement/0",
    category: "misc",
    markdown: "# H\nfoo\nbar\n",
  },
  {
    id: "hunt/diff-fold-eof-replacement/1",
    category: "misc",
    markdown: "# H\nfoo\nBAZ\n",
  },
  {
    id: "hunt/diff-fold-eof-replacement/2",
    category: "misc",
    markdown: "# H\nfoo\nbar\ntail\n",
  },
  {
    id: "hunt/diff-fold-eof-replacement/3",
    category: "misc",
    markdown: "# H\nfoo\nBAZ\ntail\n",
  },
  {
    id: "hunt/diff-fold-eof-replacement/4",
    category: "misc",
    markdown: "# H\na\nb\n",
  },
  {
    id: "hunt/diff-fold-eof-replacement/5",
    category: "misc",
    markdown: "# H\nc\n",
  },
  {
    id: "hunt/diff-fold-replacement-hunk/0",
    category: "misc",
    markdown: "# H\na\nb\ntail\n",
  },
  {
    id: "hunt/diff-fold-replacement-hunk/1",
    category: "misc",
    markdown: "# H\nx\ny\ntail\n",
  },
  {
    id: "hunt/diff-fold-replacement-hunk/2",
    category: "footnote",
    markdown: "body[^2]\n\n## Footnotes\n[^2]: two\n[^1]: one\n",
  },
  {
    id: "hunt/diff-fold-replacement-hunk/3",
    category: "footnote",
    markdown: "body[^1]\n\n## Footnotes\n[^1]: two\n[^2]: one\n",
  },
  {
    id: "hunt/diff-fold-replacement-hunk/4",
    category: "misc",
    markdown: "# H\nx\ntail\n",
  },
  {
    id: "hunt/diff-fold-replacement-hunk/5",
    category: "misc",
    markdown: "# H\na\ntail\n",
  },
  {
    id: "hunt/dots-frontmatter-closer-table-blind/0",
    category: "table",
    markdown:
      "---\nt: v\n...\n[^1]: body\n| a | b |\n| --- | --- |\n\nprose[^1]\n",
  },
  {
    id: "hunt/dots-frontmatter-closer-table-blind/1",
    category: "table",
    markdown:
      "---\nt: v\n---\n[^1]: body\n| a | b |\n| --- | --- |\n\nprose[^1]\n",
  },
  {
    id: "hunt/ends-protected-quoted-html-block/0",
    category: "blockquote",
    markdown: "text[^1]\n\n[^1]: def\n\npara\n\n> <div>\n> more html\n",
  },
  {
    id: "hunt/ends-protected-quoted-html-block/1",
    category: "footnote",
    markdown: "text[^1]\n\n[^1]: def\n\npara\n\n- <div>\n  more html\n",
  },
  {
    id: "hunt/ends-protected-quoted-html-block/2",
    category: "footnote",
    markdown: "text[^1]\n\n<div>\nmore html\n",
  },
  {
    id: "hunt/ends-protected-quoted-html-block/3",
    category: "fenced-code",
    markdown: "text[^1]\n\n```\ncode\n",
  },
  {
    id: "hunt/escaped-comment-opener/0",
    category: "html-comment",
    markdown: "\\<!-- shown literally\nreal[^7]\n",
  },
  {
    id: "hunt/escaped-marker/0",
    category: "footnote",
    markdown: "literal \\[^9] real[^7]\n\n[^7]: real\n",
  },
  {
    id: "hunt/fence-and-inline-code-backticks/0",
    category: "fenced-code",
    markdown: "```[^7]``` inline\nreal[^2]\n",
  },
  {
    id: "hunt/fence-closer-indent-follows-opener/0",
    category: "fenced-code",
    markdown: " ```\naaa[^1]\n    ```\nbbb[^2]\n",
  },
  {
    id: "hunt/fix-lazy-setext-chain-not-idempotent/0",
    category: "setext",
    markdown: "para\n[^1]: a\n===\n[^2]: b\n\nx[^1] y[^2]\n",
  },
  {
    id: "hunt/fix-lazy-setext-chain-not-idempotent/1",
    category: "setext",
    markdown:
      "para\n[^1]: a\n===\n[^2]: b\n===\n[^3]: c\n\nx[^1] y[^2] z[^3]\n",
  },
  {
    id: "hunt/fix-lazy-setext-chain-not-idempotent/2",
    category: "footnote",
    markdown: "para\n[^1]: a\n\nx[^1]\n",
  },
  {
    id: "hunt/fix-lazy-skip-not-revisited/0",
    category: "indented-code",
    markdown:
      "- item\n  [^37]: a\nx $$\n$$ tail\n[^3]: b\nstray[^26] reference\n[^21]: first\n    continuation\n\n    second para[^22]\n",
  },
  {
    id: "hunt/fold-mapping-inline-rewrite/0",
    category: "footnote",
    markdown: "# H\nx[^2] y[^1]\n\n[^2]: two\n[^1]: one\n",
  },
  {
    id: "hunt/fold-mapping-inline-rewrite/1",
    category: "indented-code",
    markdown:
      "# H\n- parent\n    - child[^2]\n    - child[^1]\ntail\n\n[^2]: two\n[^1]: one\n",
  },
  {
    id: "hunt/fold-mapping-inline-rewrite/2",
    category: "footnote",
    markdown: "- child[^20]\n- item [^20]\n- item [^20]\ntail\n- child[^20]\n",
  },
  {
    id: "hunt/fold-mapping-inline-rewrite/3",
    category: "footnote",
    markdown: "1. numbered [^10]\n- child[^20]\n\n- item [^20]\ntail\n",
  },
  {
    id: "hunt/fold-mapping-inline-rewrite/4",
    category: "footnote",
    markdown: "# A\nbody\nmore\n\n# B\nx[^1].\n\n[^1]: one\n",
  },
  {
    id: "hunt/fold-mapping-inline-rewrite/5",
    category: "footnote",
    markdown: "# A\nbody\nmore\n\n# B\nx.[^1]\n\n[^1]: one\n",
  },
  {
    id: "hunt/fold-mapping-inline-rewrite/6",
    category: "footnote",
    markdown: "[^1]: moved\nbody[^1]\n\n# A\nfold me\nmore\n",
  },
  {
    id: "hunt/fold-mapping-inline-rewrite/7",
    category: "footnote",
    markdown: "body[^1]\n\n# A\nfold me\nmore\n\n[^1]: moved\n",
  },
  {
    id: "hunt/fold-mapping-inline-rewrite/8",
    category: "footnote",
    markdown: "# H\nx[^2] y[^1]\ntail\n\n[^1]: one\n\n[^2]: two\n",
  },
  {
    id: "hunt/fold-mapping-inline-rewrite/9",
    category: "footnote",
    markdown: "# H\nx[^1] y[^2]\ntail\n\n[^1]: two\n\n[^2]: one\n",
  },
  {
    id: "hunt/gen-comment-opener-inside-name/0",
    category: "html-comment",
    markdown: "[^a<!--b]: body\n\nsee[^a<!--b] here.\n",
  },
  {
    id: "hunt/gen-comment-opener-inside-name/1",
    category: "html-comment",
    markdown: "see[^a<!--b] here.\n\ntail\n\n[^a<!--b]: body\n",
  },
  {
    id: "hunt/gen-fence-in-quote-in-list/0",
    category: "fenced-code",
    markdown: "- > ```\n  > code[^99]\n  > ```\nafter[^1]\n",
  },
  {
    id: "hunt/gen-fence-in-quote-in-list/1",
    category: "fenced-code",
    markdown: "- > ```\n  > [^9]: fake\n  > ```\nreal[^1]\n\n[^1]: real\n",
  },
  {
    id: "hunt/gen-list-fence-outlives-item/0",
    category: "fenced-code",
    markdown: "- ```\n  code\n\nplain[^1]\n",
  },
  {
    id: "hunt/gen-list-fence-outlives-item/1",
    category: "fenced-code",
    markdown: "- ```\n  code\nplain[^1]\n",
  },
  {
    id: "hunt/gen-list-fence-outlives-item/2",
    category: "fenced-code",
    markdown: "1. ```\n   code\nplain[^1]\n",
  },
  {
    id: "hunt/gen-list-fence-outlives-item/3",
    category: "fenced-code",
    markdown: "- ```\n  code[^99]\nplain[^1]\n",
  },
  {
    id: "hunt/gen-list-fence-outlives-item/4",
    category: "fenced-code",
    markdown: "- ```\n  code[^99]\n\nplain[^1]\n",
  },
  {
    id: "hunt/gen-list-fence-outlives-item/5",
    category: "fenced-code",
    markdown: "- ```\n  code[^99]\n- item[^1]\n",
  },
  {
    id: "hunt/gen-list-fence-outlives-item/6",
    category: "fenced-code",
    markdown: "1. ```\n   code\n\nplain[^1]\n",
  },
  {
    id: "hunt/gen-list-fence-outlives-item/7",
    category: "fenced-code",
    markdown: "- outer\n  - ```\n    code\n\nplain[^1]\n",
  },
  {
    id: "hunt/gen-list-fence-outlives-item/8",
    category: "fenced-code",
    markdown: "10. ```\n    code\n\nswallowed\n",
  },
  {
    id: "hunt/gen-list-fence-outlives-item/9",
    category: "fenced-code",
    markdown: "- ```\n  code[^9]\n```\nreal[^1]\n",
  },
  {
    id: "hunt/gen-list-fence-outlives-item/10",
    category: "fenced-code",
    markdown: "- ```\n  code\npara[^1]\n\n[^1]: def\n\ntail\n",
  },
  {
    id: "hunt/gen-list-fence-outlives-item/11",
    category: "fenced-code",
    markdown: "- ```\n  code\n\nreal[^1]\n\n[^1]: def\n\n[^9]: stray\n",
  },
  {
    id: "hunt/gen-nested-list-fence/0",
    category: "fenced-code",
    markdown: "- - ```\n    fake[^99]\n    ```\nafter[^1]\n",
  },
  {
    id: "hunt/gen-nested-list-fence/1",
    category: "fenced-code",
    markdown:
      "- - ```\n    fake[^99]\n    ```\npara[^1]\n\n[^1]: def\n\ntail\n",
  },
  {
    id: "hunt/heading-migration-mangles-deliberate-value/0",
    category: "setext",
    markdown: "---\n## Footnotes\n",
  },
  {
    id: "hunt/image-alt-blot-hides-reference/0",
    category: "footnote",
    markdown: "see [^a$b]![i](u)$m$ tail\n\n[^a$b]: def\n",
  },
  {
    id: "hunt/image-alt-blot-hides-reference/1",
    category: "html-comment",
    markdown: "body [^c<!--d] ![i](u) tail\n--> end\n\n[^c<!--d]: def\n",
  },
  {
    id: "hunt/image-alt-with-brackets/0",
    category: "footnote",
    markdown: "see ![alt[^1]](url)\n\n[^1]: one\n",
  },
  {
    id: "hunt/image-alt-with-brackets/1",
    category: "footnote",
    markdown: "![see [^1] here](u)\n\n[^1]: one\n",
  },
  {
    id: "hunt/image-alt-with-brackets/2",
    category: "footnote",
    markdown: "see ![alt[^1]](url) then[^2]\n\n[^1]: stray\n[^2]: real\n",
  },
  {
    id: "hunt/image-alt-with-brackets/3",
    category: "footnote",
    markdown: "see ![ref ^1 here](url)\n\n[^1]: one\n",
  },
  {
    id: "hunt/image-alt-with-brackets/4",
    category: "footnote",
    markdown: "[x[^1]](url)\n\n[^1]: one\n",
  },
  {
    id: "hunt/in-item-label-at-the-item-margin/0",
    category: "footnote",
    markdown: "- item\n\n  [^la]: in item\n\nprose[^la] here\n",
  },
  {
    id: "hunt/in-item-label-at-the-item-margin/1",
    category: "footnote",
    markdown: "1. item\n\n   [^la]: in item\n\nprose[^la] here\n",
  },
  {
    id: "hunt/in-item-label-at-the-item-margin/2",
    category: "indented-code",
    markdown: "- item\n\n    [^la]: in item\n\nprose[^la] here\n",
  },
  {
    id: "hunt/in-item-label-at-the-item-margin/3",
    category: "footnote",
    markdown: "- [^la]: in item\n\nprose[^la] here\n",
  },
  {
    id: "hunt/in-item-lazy-label-counted-as-definition/0",
    category: "indented-code",
    markdown:
      "- item text\n    [^lc]: straight under the marker line\n\nuse[^lc] here\n",
  },
  {
    id: "hunt/in-item-lazy-label-counted-as-definition/1",
    category: "indented-code",
    markdown:
      "- item\n\n    > quote line\n    > [^lb]: under quoted prose\n\nuse[^lb] here\n",
  },
  {
    id: "hunt/in-item-lazy-label-counted-as-definition/2",
    category: "indented-code",
    markdown:
      "- item\n\n    [^la]: a real in-item definition\n\nuse[^la] here\n",
  },
  {
    id: "hunt/in-item-lazy-label-counted-as-definition/3",
    category: "footnote",
    markdown: "para\n[^ld]: lazy at the margin\n\nuse[^ld] here\n",
  },
  {
    id: "hunt/indent-after-heading-live/0",
    category: "indented-code",
    markdown: "# Title\n    code[^9]\n\nafter\n\n[^9]: def\n",
  },
  {
    id: "hunt/indent-after-heading-live/1",
    category: "fenced-code",
    markdown: "```\nf\n```\n    chunk[^9]\n",
  },
  {
    id: "hunt/indent-after-heading-live/2",
    category: "indented-code",
    markdown: "x\n\n---\n    code[^9]\n",
  },
  {
    id: "hunt/indent-after-heading-live/3",
    category: "indented-code",
    markdown: "<!--\nhidden\n-->\n    chunk[^9]\n",
  },
  {
    id: "hunt/indent-after-heading-live/4",
    category: "indented-code",
    markdown: "para\n    lazy[^1]\n",
  },
  {
    id: "hunt/indent-after-heading-live/5",
    category: "indented-code",
    markdown: "[^1]: x\n    cont[^2]\n",
  },
  {
    id: "hunt/indented-code-after-blank-quote/0",
    category: "blockquote",
    markdown: "> quote\n>\n    code[^1]\n\nafter\n",
  },
  {
    id: "hunt/indented-code-after-blank-quote/1",
    category: "blockquote",
    markdown: "> quote\n\n    code[^1]\n\nafter\n",
  },
  {
    id: "hunt/indented-code-after-blank-quote/2",
    category: "blockquote",
    markdown: "> quote\n> more\n    code[^1]\n\nafter\n",
  },
  {
    id: "hunt/indented-code-after-quoted-heading/0",
    category: "blockquote",
    markdown: "> ---\n>     see [^1]. end\n",
  },
  {
    id: "hunt/indented-code-after-quoted-heading/1",
    category: "blockquote",
    markdown: "> # Notes\n>     see [^1] in code\n",
  },
  {
    id: "hunt/indented-code-after-table/0",
    category: "indented-code",
    markdown: "| a |\n| --- |\n    code[^1]\n\nafter\n",
  },
  {
    id: "hunt/indented-code-after-table/1",
    category: "indented-code",
    markdown: "para\n    code[^1]\n\nafter\n",
  },
  {
    id: "hunt/indented-code-after-table/2",
    category: "indented-code",
    markdown: "para\n\n    code[^1]\n\nafter\n",
  },
  {
    id: "hunt/indented-code-after-table/3",
    category: "indented-code",
    markdown: "[^21]: first\n    continuation\n\n    second para[^22]\n\n",
  },
  {
    id: "hunt/indented-code-after-table/4",
    category: "indented-code",
    markdown:
      "| a | b |\n| --- | --- |\n| c[^12] | d |\n[^12]: def\n    continuation\n\n    second para[^22]\n",
  },
  {
    id: "hunt/indented-code-after-table/5",
    category: "indented-code",
    markdown: "[^21]: first\n    continuation\n\n    second para\n\n",
  },
  {
    id: "hunt/indented-code-after-table/6",
    category: "indented-code",
    markdown:
      "| a | b |\n| --- | --- |\n| c[^12] | d |\n[^12]: def\n    continuation\n\n    second para\n",
  },
  {
    id: "hunt/indented-code-unprotected/0",
    category: "indented-code",
    markdown: "    code[^90]\nreal[^2]\n",
  },
  {
    id: "hunt/indented-code-unprotected/1",
    category: "indented-code",
    markdown: "    sample[^9]\nreal[^2]\n\n[^2]: real\n",
  },
  {
    id: "hunt/indented-code-unprotected/2",
    category: "indented-code",
    markdown: "    sample[^9]\nreal[^1]\n\n[^1]: real\n",
  },
  {
    id: "hunt/indented-code-unprotected/3",
    category: "indented-code",
    markdown: "    code[^9].\nreal[^1].\n",
  },
  {
    id: "hunt/indented-code-unprotected/4",
    category: "indented-code",
    markdown: "    code[^9].\nreal.[^1]\n",
  },
  {
    id: "hunt/indented-code-unprotected/5",
    category: "indented-code",
    markdown: "    code[^9]\nreal[^1]\n\n[^1]: real\n",
  },
  {
    id: "hunt/indented-code-unprotected/6",
    category: "indented-code",
    markdown: "    code[^9]\nreal[^2.1]\n\n[^2.1]: real\n",
  },
  {
    id: "hunt/indented-definition-label/0",
    category: "footnote",
    markdown: "a[^1]\n\n  [^1]: indented\n",
  },
  {
    id: "hunt/indented-definition-label/1",
    category: "footnote",
    markdown: "b[^2] a[^1]\n\n  [^1]: one\n  [^2]: two\n",
  },
  {
    id: "hunt/inline-footnote-double-parse/0",
    category: "inline-footnote",
    markdown: "inline ^[^9] real[^7]\n\n[^7]: body\n",
  },
  {
    id: "hunt/inline-footnote-double-parse/1",
    category: "inline-footnote",
    markdown: "inline ^[^note] real[^1]\n\n[^1]: body\n",
  },
  {
    id: "hunt/interrupting-block-keeps-definition-open/0",
    category: "indented-code",
    markdown: "use[^1] here\n\n[^1]: body\n<!-- c -->\n    chunk[^73]\n",
  },
  {
    id: "hunt/invalid-name-rewritten-by-rules/0",
    category: "footnote",
    markdown: "Alpha.\n\n[^1 ]: prose that only looks like a label\n",
  },
  {
    id: "hunt/invalid-name-rewritten-by-rules/1",
    category: "footnote",
    markdown: "Alpha.\n\n[^my note]: The full citation goes here.\n",
  },
  {
    id: "hunt/invalid-name-rewritten-by-rules/2",
    category: "footnote",
    markdown: "Alpha[^ 1] and bravo[^2].\n\n[^2]: two\n",
  },
  {
    id: "hunt/invalid-name-rewritten-by-rules/3",
    category: "footnote",
    markdown: "Alpha[^ 1] here.\n",
  },
  {
    id: "hunt/invalid-name-rewritten-by-rules/4",
    category: "footnote",
    markdown: "Alpha[^ 1]. Bravo.\n",
  },
  {
    id: "hunt/invalid-name-rewritten-by-rules/5",
    category: "footnote",
    markdown: "Prose with [^my note] in it, nothing else.\n",
  },
  {
    id: "hunt/label-after-comment-closer-mangled/0",
    category: "html-comment",
    markdown: "x[^1]\n\n<!--\nhidden\n--> [^1]: freed label\n",
  },
  {
    id: "hunt/label-after-comment-closer-mangled/1",
    category: "html-comment",
    markdown: "x[^1]\n\n<!-- draft note --> [^1]: def\n",
  },
  {
    id: "hunt/label-after-comment-closer-mangled/2",
    category: "comment",
    markdown: "x[^1]\n\n%%\nhidden\n%% [^1]: freed label\n",
  },
  {
    id: "hunt/label-after-comment-closer-mangled/3",
    category: "blockquote",
    markdown: "x[^1]\n\n> %%\n> hidden\n> %% [^1]: freed\n",
  },
  {
    id: "hunt/label-after-comment-closer-tail/0",
    category: "html-comment",
    markdown: "use[^1] here\nx <!-- a\n--> tail\n[^1]: the definition\n",
  },
  {
    id: "hunt/label-after-comment-closer-tail/1",
    category: "html-comment",
    markdown: "use[^1] here\nx <!-- a\n-->\n[^1]: the definition\n",
  },
  {
    id: "hunt/label-after-comment-closer-tail/2",
    category: "html-comment",
    markdown: "use[^1] here\n<!-- a\n--> tail\n[^1]: the definition\n",
  },
  {
    id: "hunt/label-after-comment-closer-tail/3",
    category: "footnote",
    markdown: "use[^1] here\nx $$\n$$ tail\n[^1]: the definition\n",
  },
  {
    id: "hunt/label-after-pipeless-table/0",
    category: "footnote",
    markdown: "a | b\n--- | ---\n[^1]: x\n\nuse[^1]\n",
  },
  {
    id: "hunt/label-after-pipeless-table/1",
    category: "table",
    markdown: "| a | b |\n| --- | --- |\n[^1]: x\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/0",
    category: "footnote",
    markdown: "a[^1]\npara\n[^1]: mid\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/1",
    category: "footnote",
    markdown: "para\n[^1]: mid\n\nuse[^1]\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/2",
    category: "footnote",
    markdown: "a[^1]\npara\n  [^1]: mid\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/3",
    category: "footnote",
    markdown: "a[^1]\n- item\n[^1]: mid\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/4",
    category: "blockquote",
    markdown: "a[^1]\n> quote\n[^1]: mid\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/5",
    category: "footnote",
    markdown: "a[^1] b[^2]\n[^2]: first\n[^1]: mid\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/6",
    category: "indented-code",
    markdown: "para\n    lazy\n[^1]: mid\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/7",
    category: "footnote",
    markdown: "a[^1]\npara\n\n[^1]: mid\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/8",
    category: "footnote",
    markdown: "a[^1]\n# Heading\n[^1]: mid\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/9",
    category: "fenced-code",
    markdown: "a[^1]\n```\ncode\n```\n[^1]: mid\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/10",
    category: "setext",
    markdown: "a[^1]\n---\n[^1]: mid\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/11",
    category: "footnote",
    markdown: "x\n\n[^1]: one\n[^2]: two\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/12",
    category: "indented-code",
    markdown: "x\n\n[^1]: one\n    more\n[^2]: two\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/13",
    category: "setext",
    markdown: "---\ntitle: t\n---\n[^1]: right after frontmatter\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/14",
    category: "blockquote",
    markdown: "> para\n> [^q]: quoted under prose\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/15",
    category: "blockquote",
    markdown: "> para\n>\n> [^q]: after a quote blank\n",
  },
  {
    id: "hunt/label-after-prose-line-is-prose/16",
    category: "footnote",
    markdown: "a[^1]\npara\n[^2]: mid\n",
  },
  {
    id: "hunt/label-gap-chunk-protected/0",
    category: "indented-code",
    markdown: "    code\n[^1]: body\n\n    chunk[^9]\n",
  },
  {
    id: "hunt/label-under-multiline-lrd/0",
    category: "footnote",
    markdown: '[foo]: /url\n  "title"\n[^1]: x\n',
  },
  {
    id: "hunt/lazy-continuation-paragraph-lines/0",
    category: "fenced-code",
    markdown: "text[^1] here\n\n[^1]: body\n``` `x`\nmore\n",
  },
  {
    id: "hunt/lazy-continuation-paragraph-lines/1",
    category: "footnote",
    markdown: "text[^1] here\n\n[^1]: body\n<3 heart\n",
  },
  {
    id: "hunt/lazy-continuation-paragraph-lines/2",
    category: "comment",
    markdown: "text[^1] here\n\n[^1]: body\n%% c %%\n",
  },
  {
    id: "hunt/lazy-continuation-paragraph-lines/3",
    category: "fenced-code",
    markdown:
      "text[^2] here\n\n[^1]: body\n``` `x`\n[^2]: second\ntext[^2] tail\n",
  },
  {
    id: "hunt/lazy-continuation-paragraph-lines/4",
    category: "fenced-code",
    markdown: "text[^1] here\n\n[^1]: body\n```js\ncode\n```\n",
  },
  {
    id: "hunt/lazy-continuation-paragraph-lines/5",
    category: "footnote",
    markdown: "text[^1] here\n\n[^1]: body\nmore lazy\n",
  },
  {
    id: "hunt/lazy-label-in-inline-comment/0",
    category: "footnote",
    markdown: "para\n[^1]: x\n",
  },
  {
    id: "hunt/lazy-label-in-inline-comment/1",
    category: "comment",
    markdown: "%%\nhidden\n%% [^1]: x\n",
  },
  {
    id: "hunt/lazy-label-opens-wide-fence/0",
    category: "fenced-code",
    markdown: "prose\n[^1]: lazy label\n    ```\nlive[^9] text\n",
  },
  {
    id: "hunt/lazy-label-reference-is-live/0",
    category: "footnote",
    markdown: "prose\n[^1]: lazy body\n\n[^1]: real body\n",
  },
  {
    id: "hunt/lazy-label-reference-is-live/1",
    category: "footnote",
    markdown: "prose\n[^1]: lazy text\n\npara[^9]\n\n[^9]: real\n",
  },
  {
    id: "hunt/lazy-label-reference-is-live/2",
    category: "blockquote",
    markdown: "prose\n> [^1]: quoted def\n\nbody[^1]\n",
  },
  {
    id: "hunt/lazy-label-reference-is-live/3",
    category: "setext",
    markdown: "text[^1]\n\nH\n===\n[^1]: real\n",
  },
  {
    id: "hunt/lazy-label-reference-is-live/4",
    category: "blockquote",
    markdown: "> [!note] Title\n[^1]: x\n\nbody[^1]\n",
  },
  {
    id: "hunt/lazy-label-reference-is-live/5",
    category: "blockquote",
    markdown: "> [!note] Title\n> [^1]: x\n\nbody[^1]\n",
  },
  {
    id: "hunt/lazy-label-reference-is-live/6",
    category: "footnote",
    markdown: "[^9]\n[^1]: def\n\ntext[^1]\n",
  },
  {
    id: "hunt/lint-alerts-quoted-definitions/0",
    category: "blockquote",
    markdown: "> [^1]: see [^2]\n\nuse[^1] use2[^2]\n",
  },
  {
    id: "hunt/lint-alerts-quoted-definitions/1",
    category: "footnote",
    markdown: "[^1]: see [^2]\n\nuse[^1] use2[^2]\n",
  },
  {
    id: "hunt/lint-heading-reference-not-idempotent/0",
    category: "setext",
    markdown: "---\n## Notes\n",
  },
  {
    id: "hunt/lint-heading-reference-not-idempotent/1",
    category: "footnote",
    markdown: "text[^1]\n\n[^1]: a\n\n[^9]: stray\n",
  },
  {
    id: "hunt/lint-heading-reference-not-idempotent/2",
    category: "footnote",
    markdown: "text[^1]\n\n# Footnotes\n\n[^1]: a\n",
  },
  {
    id: "hunt/lint-placeholder-case-silent/0",
    category: "setext",
    markdown: "---\nfootnote-prefix: p.\n---\n\nx [^P.] y\n",
  },
  {
    id: "hunt/lint-prefix-quoted-numbered/0",
    category: "blockquote",
    markdown: "x[^1]\n\n> [^2]: quoted orphan\n\n[^1]: a\n",
  },
  {
    id: "hunt/lint-prefix-quoted-numbered/1",
    category: "blockquote",
    markdown: "x[^1]\n\n> [^note]: quoted orphan\n\n[^1]: a\n",
  },
  {
    id: "hunt/lint-prefix-quoted-numbered/2",
    category: "blockquote",
    markdown:
      "---\nfootnote-prefix: p.\n---\n\nx[^1]\n\n> [^2]: quoted orphan\n\n[^1]: a\n",
  },
  {
    id: "hunt/lint-punctuation-swallows-opener/0",
    category: "footnote",
    markdown: "see the note[^1]*important* today\n\n[^1]: x\n",
  },
  {
    id: "hunt/lint-punctuation-swallows-opener/1",
    category: "footnote",
    markdown: "see the note[^1]**important** today\n\n[^1]: x\n",
  },
  {
    id: "hunt/lint-punctuation-swallows-opener/2",
    category: "footnote",
    markdown: "see the note[^1]==marked== today\n\n[^1]: x\n",
  },
  {
    id: "hunt/lint-punctuation-swallows-opener/3",
    category: "footnote",
    markdown: 'see the note[^1]"quoted" today\n\n[^1]: x\n',
  },
  {
    id: "hunt/lint-refused-orphan-silent/0",
    category: "indented-code",
    markdown: "[^1]: alpha\n\n[^42]\n\n    indented code[^73]\n",
  },
  {
    id: "hunt/lint-refused-orphan-silent/1",
    category: "indented-code",
    markdown:
      "## Footnotes\n\n[^1]: alpha\n\n[^42]\n\n    indented code[^73]\n",
  },
  {
    id: "hunt/list-fence-indented-closer/0",
    category: "fenced-code",
    markdown: "10. ```\n    fake[^1]\n    ```\n\nafter[^2]\n\n[^2]: def\n",
  },
  {
    id: "hunt/list-fence-indented-closer/1",
    category: "fenced-code",
    markdown: "- outer\n  - ```\n    fake[^1]\n    ```\n\nafter[^2]\n",
  },
  {
    id: "hunt/list-fence-indented-closer/2",
    category: "fenced-code",
    markdown: "```\ncode\n    ```\nstill code\n```\nafter\n",
  },
  {
    id: "hunt/list-item-fence/0",
    category: "fenced-code",
    markdown: "- ```\n  code[^9]\n  ```\nreal[^1]\n",
  },
  {
    id: "hunt/list-item-fence/1",
    category: "fenced-code",
    markdown: "1. ~~~\n   code[^9]\n   ~~~\nreal[^1]\n",
  },
  {
    id: "hunt/list-item-label-margin/0",
    category: "indented-code",
    markdown: "- item\n\n    [^1]: def\n\nuse[^1]\n",
  },
  {
    id: "hunt/list-item-label-margin/1",
    category: "indented-code",
    markdown: "1. item\n\n    [^1]: def\n\nuse[^1]\n",
  },
  {
    id: "hunt/list-item-label-margin/2",
    category: "indented-code",
    markdown: "10. item\n\n       [^1]: def\n\nuse[^1]\n",
  },
  {
    id: "hunt/list-item-label-margin/3",
    category: "footnote",
    markdown: "- item\n\n  [^1]: def\n\nuse[^1]\n",
  },
  {
    id: "hunt/list-item-label-margin/4",
    category: "indented-code",
    markdown: "- item\n\n      [^1]: def\n\nuse[^1]\n",
  },
  {
    id: "hunt/loose-list-indented-continuation/0",
    category: "indented-code",
    markdown: "- a\n\n    - b[^1]\n\n[^1]: def\n",
  },
  {
    id: "hunt/loose-list-indented-continuation/1",
    category: "indented-code",
    markdown: "- see\n\n    details[^1]\n\n[^1]: def\n",
  },
  {
    id: "hunt/loose-list-indented-continuation/2",
    category: "indented-code",
    markdown: "- see\n\n    details[^1]\n\n[^1]: def\n[^9]: orphan\n",
  },
  {
    id: "hunt/loose-list-indented-continuation/3",
    category: "indented-code",
    markdown: "- a\n\n        code[^8]\n",
  },
  {
    id: "hunt/loose-list-indented-continuation/4",
    category: "indented-code",
    markdown: "10. a\n\n    cont[^1]\n",
  },
  {
    id: "hunt/loose-list-indented-continuation/5",
    category: "indented-code",
    markdown: "10. a\n\n         code[^1]\n",
  },
  {
    id: "hunt/loose-list-indented-continuation/6",
    category: "indented-code",
    markdown: "- a\n\npara\n\n    code[^7]\n",
  },
  {
    id: "hunt/lrd-destination-next-line/0",
    category: "footnote",
    markdown: "[foo]:\n/url\n[^1]: x\n",
  },
  {
    id: "hunt/lrd-destination-next-line/1",
    category: "footnote",
    markdown: '[foo]:\n/url\n   "t"\n[^1]: x\n',
  },
  {
    id: "hunt/lrd-destination-reference/0",
    category: "footnote",
    markdown: "[foo]: [^9]\n\nuse[^9]\n\n[^9]: nine\n",
  },
  {
    id: "hunt/lrd-destination-reference/1",
    category: "footnote",
    markdown: "[foo]: <[^9]>\n\nuse[^9]\n\n[^9]: nine\n",
  },
  {
    id: "hunt/masked-name-identity/0",
    category: "footnote",
    markdown: "see[^a`b`c] twice[^a`b`c].\n\n[^a`b`c]: hi\n",
  },
  {
    id: "hunt/masked-name-identity/1",
    category: "html-comment",
    markdown: "see[^a<!--x-->b].\n\n[^a<!--x-->b]: hi\n",
  },
  {
    id: "hunt/math-regions-unprotected/0",
    category: "footnote",
    markdown: "$$\nx[^7]\n$$\nreal[^1]\n",
  },
  {
    id: "hunt/math-regions-unprotected/1",
    category: "footnote",
    markdown: "$x[^9]$ real[^2]\n$$\ny[^8]\n$$\n\n[^2]: real\n",
  },
  {
    id: "hunt/math-regions-unprotected/2",
    category: "footnote",
    markdown:
      "$$\n[^9]: mathematical label\n$$\nprose[^2]\n\n[^2]: real\ntail\n",
  },
  {
    id: "hunt/math-regions-unprotected/3",
    category: "setext",
    markdown:
      "---\nfootnote-prefix: 4.\n---\n$x[^9].$ real[^2].\n$$\n[^8]: mathematical label\ny[^7]\n$$\n\n[^2]: real\n",
  },
  {
    id: "hunt/merge-duplicate-flattens-table/0",
    category: "table",
    markdown:
      "use[^1]\n\n[^1]: first\n\ntail\n\n[^1]: | a | b |\n| --- |\n| x | y |\n",
  },
  {
    id: "hunt/merge-duplicate-flattens-table/1",
    category: "table",
    markdown:
      "use[^1]\n\n[^1]: | a | b |\n| --- |\n| x | y |\n\ntail\n\n[^1]: second\n",
  },
  {
    id: "hunt/move-glues-lazy-tail-onto-label/0",
    category: "footnote",
    markdown:
      "para[^1][^2]\n\n[^1]: one\nlazy tail\n\n[^2]: two\n\nmore prose\n",
  },
  {
    id: "hunt/move-glues-lazy-tail-onto-label/1",
    category: "indented-code",
    markdown:
      "para[^1][^2]\n\n[^1]: one\n    indented tail\n\n[^2]: two\n\nmore prose\n",
  },
  {
    id: "hunt/move-glues-lazy-tail-onto-label/2",
    category: "footnote",
    markdown: "para[^1][^2]\n\n[^1]: one\n\n[^2]: two\n\nmore prose\n",
  },
  {
    id: "hunt/move-heading-endswith-false-positive/0",
    category: "footnote",
    markdown: "body[^1].\n## Footnotes\n\n[^1]: def\n",
  },
  {
    id: "hunt/move-heading-endswith-false-positive/1",
    category: "footnote",
    markdown: "body[^1].\nprose about the # Footnotes\n\n[^1]: def\n",
  },
  {
    id: "hunt/move-heading-endswith-false-positive/2",
    category: "setext",
    markdown: "---\ntitle: x\n---\n[^1]: def\n",
  },
  {
    id: "hunt/move-out-of-html-comment/0",
    category: "html-comment",
    markdown: "real[^1].\n\n<!--\n[^9]: hidden note\n-->\n\n[^1]: def\n",
  },
  {
    id: "hunt/move-to-bottom-into-unclosed-fence/0",
    category: "fenced-code",
    markdown: "a[^1].\n\n[^1]: def\n\n```\nfake[^2]\n[^2]: unreachable\n",
  },
  {
    id: "hunt/moved-definition-adopts-indented-code/0",
    category: "indented-code",
    markdown: "[^1]: sees [^1]\n\n# Footnotes\n\n\tcode-shaped[^89]\n",
  },
  {
    id: "hunt/moved-definition-adopts-indented-code/1",
    category: "indented-code",
    markdown:
      "[^1]: sees [^1]\n\n# Footnotes\n\n\tone\n\n\ttwo\n\nTail prose.\n",
  },
  {
    id: "hunt/moved-definition-adopts-indented-code/2",
    category: "footnote",
    markdown: "[^1]: sees [^1]\n\n# Footnotes\n\nTail prose.\n",
  },
  {
    id: "hunt/name-apply-prefix-misses-quoted-definition/0",
    category: "blockquote",
    markdown: "text[^note] here\n\n> [^p.note]: quoted definition\n",
  },
  {
    id: "hunt/name-apply-prefix-misses-quoted-definition/1",
    category: "footnote",
    markdown: "text[^note] here\n\n[^p.note]: plain definition\n",
  },
  {
    id: "hunt/name-apply-prefix-misses-quoted-definition/2",
    category: "blockquote",
    markdown: "> [^note]: one\n\n> [^p.note]: two\n",
  },
  {
    id: "hunt/name-prefix-space-before-colon/0",
    category: "setext",
    markdown: "---\nfootnote-prefix : 2.\n---\nbody[^1]\n",
  },
  {
    id: "hunt/name-prefix-space-before-colon/1",
    category: "indented-code",
    markdown: "---\nfootnote-prefix\t: 2.\n---\nbody[^1]\n",
  },
  {
    id: "hunt/name-prefix-space-before-colon/2",
    category: "setext",
    markdown: "---\nfootnote-prefix: 2.\n---\nbody[^1]\n",
  },
  {
    id: "hunt/name-prefix-unterminated-quote/0",
    category: "setext",
    markdown: '---\nfootnote-prefix: "2.\n---\nbody[^1]\n',
  },
  {
    id: "hunt/name-prefix-unterminated-quote/1",
    category: "setext",
    markdown: '---\nfootnote-prefix: "2."\n---\nbody[^1]\n',
  },
  {
    id: "hunt/nested-alert-duplicate-names/0",
    category: "inline-footnote",
    markdown:
      "text with no reference to z anywhere.\n\n[^z]: contains ^[an inline note] here\n[^z]: second copy also nested [^w]\n\n[^w]: w body\n",
  },
  {
    id: "hunt/orphan-cut-rule-residue-deferred-deletion/0",
    category: "indented-code",
    markdown: "[^1]: body\n    cont\n---\n",
  },
  {
    id: "hunt/orphan-cut-rule-residue-deferred-deletion/1",
    category: "indented-code",
    markdown: "[^1]: body\n    cont\n===\n",
  },
  {
    id: "hunt/orphan-cut-rule-residue-deferred-deletion/2",
    category: "setext",
    markdown: "para\n\n[^1]: body\n\nrule\n---\n",
  },
  {
    id: "hunt/orphan-definition-delete-reclassifies/0",
    category: "setext",
    markdown: "para\n===\n[^4]: x $$\n$$ tail\n[^3]: y\n",
  },
  {
    id: "hunt/orphan-definition-delete-reclassifies/1",
    category: "setext",
    markdown: "para\n===\n[^4]: x $$\n$$ tail\n",
  },
  {
    id: "hunt/orphan-delete-comment-opener-residue/0",
    category: "comment",
    markdown: "para\n[^9]%%\nmore text\nand more\n",
  },
  {
    id: "hunt/orphan-delete-comment-opener-residue/1",
    category: "comment",
    markdown: "[^1]: d\n\ntext[^1]\n\npara\n[^9]%%\nmore text\n",
  },
  {
    id: "hunt/orphan-delete-comment-opener-residue/2",
    category: "comment",
    markdown: "para\n[^9]%%\nmore text\n\ntext[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/orphan-delete-comment-opener-residue/3",
    category: "blockquote",
    markdown:
      "para\n[^119]%%\nmore text\n\n>    > nested[^87]\n>    > [^87]: wide-gap definition\n",
  },
  {
    id: "hunt/orphan-delete-comment-opener-residue/4",
    category: "footnote",
    markdown: "keep[^1] drop[^9] end\n\n[^1]: one\n",
  },
  {
    id: "hunt/orphan-delete-forms-block-start/0",
    category: "footnote",
    markdown: "#[^9] tail\n\ntext[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/orphan-delete-forms-block-start/1",
    category: "footnote",
    markdown: "-[^9]\n\ntext[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/orphan-delete-forms-block-start/2",
    category: "footnote",
    markdown: "1.[^9]\n\ntext[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/orphan-delete-forms-block-start/3",
    category: "footnote",
    markdown: "text\n--- [^9]\n[^x]: d\n",
  },
  {
    id: "hunt/orphan-delete-reclassifies/0",
    category: "footnote",
    markdown: "[^1]: alpha\n\n[^x]\n",
  },
  {
    id: "hunt/orphan-delete-reclassifies/1",
    category: "indented-code",
    markdown: "[^note]: alpha\n\n[^1]\n\n    indented code[^73]\n",
  },
  {
    id: "hunt/orphan-delete-reclassifies/2",
    category: "indented-code",
    markdown: "[^1]: alpha\n\n[^9]\n\n    indented code[^73]\n",
  },
  {
    id: "hunt/orphan-delete-reclassifies/3",
    category: "indented-code",
    markdown:
      "keep[^1] drop[^9] end\n\npara\n\n    indented code[^73]\n\n[^1]: one\n",
  },
  {
    id: "hunt/orphan-delete-setext-residue/0",
    category: "footnote",
    markdown: "para\n[^9]=\n\ntext[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/orphan-delete-setext-residue/1",
    category: "footnote",
    markdown: "para\n[^9]==\n\ntext[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/orphan-delete-setext-residue/2",
    category: "footnote",
    markdown: "para\n[^9]--\n\ntext[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/orphan-delete-setext-residue/3",
    category: "footnote",
    markdown: "para\n[^9]---\n\ntext[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/orphan-deletion-all-or-nothing/0",
    category: "setext",
    markdown: "[^a]: safe orphan\n\npara\n===\n[^4]: x $$\n$$ tail\n[^3]: y\n",
  },
  {
    id: "hunt/orphan-deletion-all-or-nothing/1",
    category: "indented-code",
    markdown:
      "x[^9] here\n\n[^1]: d\n\n[^8]\n\n    indented\n\ntext[^2]\n\n[^2]: d2\n",
  },
  {
    id: "hunt/paragraph-ender-swallows-inline-comment-line/0",
    category: "comment",
    markdown: "a `code\n%% c %%\nspan [^1]` tail\n",
  },
  {
    id: "hunt/paragraph-ender-swallows-inline-comment-line/1",
    category: "html-comment",
    markdown: "x <!-- [^9]\n%% c %%\n--> b [^2]\n",
  },
  {
    id: "hunt/paragraph-ender-swallows-inline-comment-line/2",
    category: "comment",
    markdown: "x $$ a\n%% c %%\n$$ b [^3]\n\n[^4]: def\n",
  },
  {
    id: "hunt/paragraph-ender-swallows-inline-comment-line/3",
    category: "comment",
    markdown: "a `code\n%%\nspan [^1]` tail\n",
  },
  {
    id: "hunt/paragraph-ender-swallows-inline-comment-line/4",
    category: "comment",
    markdown: "x $$ a\n%% c %%\n$$ b [^3]\n\n[^4]: def\n\ntext[^4]\n",
  },
  {
    id: "hunt/phantom-frontmatter/0",
    category: "setext",
    markdown: "---\n\nalpha[^1]. alpha\n\n[^Note]: alpha\n",
  },
  {
    id: "hunt/phantom-frontmatter/1",
    category: "setext",
    markdown: "---\ntitle: t\n---\n\nalpha[^1].\n\n[^1]: one\n",
  },
  {
    id: "hunt/pipeless-header-row-under-label/0",
    category: "table",
    markdown: "text[^1]\n\n[^1]: body\na | b\n| --- | --- |\nc | d\n",
  },
  {
    id: "hunt/pipeless-header-row-under-label/1",
    category: "footnote",
    markdown: "text[^1]\n\n[^1]: body\na | b\n--- | ---\nc | d\n",
  },
  {
    id: "hunt/pipeless-header-row-under-label/2",
    category: "table",
    markdown: "[^1]: body\na | b\n| --- | --- |\nc | d\n",
  },
  {
    id: "hunt/pipeless-header-row-under-label/3",
    category: "footnote",
    markdown: "[^1]: body\na | b\n--- | ---\nc | d\n",
  },
  {
    id: "hunt/pipeless-header-row-under-label/4",
    category: "table",
    markdown: "| a | b |\n| --- | --- |\nc | d\n[^2]: two\n\nsee[^2]\n",
  },
  {
    id: "hunt/pipeless-header-row-under-label/5",
    category: "blockquote",
    markdown: "> [^1]: body\n> a | b\n> --- | ---\n\ntext[^1]\n",
  },
  {
    id: "hunt/pipeless-header-row-under-label/6",
    category: "blockquote",
    markdown: "> [^1]: body\n> a | b\n> | --- | --- |\n\ntext[^1]\n",
  },
  {
    id: "hunt/pipeless-header-row-under-label/7",
    category: "table",
    markdown: "text[^1]\n\n[^1]: body\n| a | b |\n| --- | --- |\n| c | d |\n",
  },
  {
    id: "hunt/pipeless-header-row-under-label/8",
    category: "table",
    markdown: "[^1]: body\n| a | b |\n| --- | --- |\n| c | d |\n",
  },
  {
    id: "hunt/pipeless-table-definition-silent/0",
    category: "footnote",
    markdown: "a | b\n--- | ---\n[^1]: x\nc | d\n\nuse[^1]\n",
  },
  {
    id: "hunt/pipeless-table-definition-silent/1",
    category: "table",
    markdown: "| a | b |\n| --- | --- |\n[^1]: x\n| c | d |\n\nuse[^1]\n",
  },
  {
    id: "hunt/prefix-escaped-closing-quote/0",
    category: "setext",
    markdown: '---\nfootnote-prefix: "2.\\"\n---\nbody\n',
  },
  {
    id: "hunt/prefix-escaped-closing-quote/1",
    category: "setext",
    markdown: "---\nfootnote-prefix: '2.''\n---\nbody\n",
  },
  {
    id: "hunt/prefix-escaped-closing-quote/2",
    category: "setext",
    markdown: '---\nfootnote-prefix: "2."\n---\nbody\n',
  },
  {
    id: "hunt/prefix-escaped-closing-quote/3",
    category: "setext",
    markdown: '---\nfootnote-prefix: "2.\\\\"\n---\nbody\n',
  },
  {
    id: "hunt/prefix-scan-case-sensitive/0",
    category: "footnote",
    markdown: "a[^1] b[^P.1]\n\n[^1]: one\n[^P.1]: pone\n",
  },
  {
    id: "hunt/prefix-scan-case-sensitive/1",
    category: "footnote",
    markdown: "a[^1] b[^ch-1] end\n\n[^1]: one\n[^ch-1]: pre\n",
  },
  {
    id: "hunt/punctuation-run-before-colon-stays/0",
    category: "indented-code",
    markdown: "para\n    [^1]: x\n",
  },
  {
    id: "hunt/quoted-definition-own-block/0",
    category: "blockquote",
    markdown: "> [^2]: body\n> # Heading\n\ntext[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/quoted-definition-own-block/1",
    category: "blockquote",
    markdown: "> [^2]: body\n> - item\n\ntext[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/quoted-definition-own-block/2",
    category: "footnote",
    markdown: "[^2]: body\n# Heading\n\ntext[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/quoted-definition-setext-tail/0",
    category: "blockquote",
    markdown: "> [^2]: body\n> cont\n> ===\n\ntext[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/quoted-definition-tab-continuation/0",
    category: "blockquote",
    markdown: "para.\n\n> [^9]: stray\n>\n>\tbody cites[^b]\n\n[^b]: bee\n",
  },
  {
    id: "hunt/quoted-definition-tab-continuation/1",
    category: "blockquote",
    markdown: "para.\n\n> [^9]: stray\n>\n>     body cites[^b]\n\n[^b]: bee\n",
  },
  {
    id: "hunt/quoted-fence-closer-chunk-live/0",
    category: "fenced-code",
    markdown: "> ```\n> code\n> ```\n>     chunk[^9]\n",
  },
  {
    id: "hunt/quoted-fence-closer-chunk-live/1",
    category: "fenced-code",
    markdown: "```\ncode\n```\n    chunk[^9]\n",
  },
  {
    id: "hunt/quoted-fence-closer-chunk-live/2",
    category: "fenced-code",
    markdown: "> ```\n> code\n> ```\n> [^1]: x\n",
  },
  {
    id: "hunt/quoted-fence-closer-chunk-live/3",
    category: "blockquote",
    markdown: "> # H\n>     chunk\n",
  },
  {
    id: "hunt/quoted-orphan-deletion-strands-body/0",
    category: "blockquote",
    markdown: "para.\n\n> [^9]: stray\n>     body cites[^b]\n\n[^b]: bee\n",
  },
  {
    id: "hunt/quoted-orphan-deletion-strands-body/1",
    category: "indented-code",
    markdown: "para.\n\n[^9]: stray\n\n    body cites[^b]\n\n[^b]: bee\n",
  },
  {
    id: "hunt/quoted-orphan-deletion-strands-body/2",
    category: "footnote",
    markdown: "text[^1]\n\n[^9]: stray\n\n[^1]: used\n",
  },
  {
    id: "hunt/quoted-orphan-deletion-strands-body/3",
    category: "blockquote",
    markdown: "para.\n\n> [^9]: stray\n",
  },
  {
    id: "hunt/quoted-orphan-deletion-strands-body/4",
    category: "blockquote",
    markdown:
      "para.\n\n> [^9]: stray\n> and more of it\n\n> a quote of its own\n",
  },
  {
    id: "hunt/quoted-orphan-deletion-strands-body/5",
    category: "blockquote",
    markdown: "x[^a]\n\n> [^9]: stray\n> [^a]: kept\n",
  },
  {
    id: "hunt/quoted-orphan-region-split/0",
    category: "blockquote",
    markdown: "> [^1]: def\n> tail <!-- open\n> hidden [^9]\n> -->\n\nafter\n",
  },
  {
    id: "hunt/quoted-orphan-region-split/1",
    category: "blockquote",
    markdown: "> [^1]: def\n> tail $$\n> math [^9]\n> $$\n\nafter\n",
  },
  {
    id: "hunt/quoted-orphan-region-split/2",
    category: "indented-code",
    markdown:
      "[^1]: def\n    tail <!-- open\n    hidden [^9]\n    -->\n\nafter\n",
  },
  {
    id: "hunt/quoted-row-in-label-table/0",
    category: "blockquote",
    markdown:
      "text\n\n[^1]: | a | b |\n| --- | --- |\n> | c | d |\n\n> quoted live\n",
  },
  {
    id: "hunt/quoted-row-in-label-table/1",
    category: "blockquote",
    markdown:
      "use[^1].\n\n[^1]: | a | b |\n| --- | --- |\n> | c | d |\n\ntail prose\n",
  },
  {
    id: "hunt/quoted-row-in-label-table/2",
    category: "table",
    markdown: "text\n\n[^1]: | a | b |\n| --- | --- |\n| c | d |\n",
  },
  {
    id: "hunt/refused-orphan-deletion-unreported/0",
    category: "indented-code",
    markdown:
      "[^1]: alpha\n\n[^42]\n\n    indented code[^73]\n\nother[^99] here\n",
  },
  {
    id: "hunt/refused-orphan-deletion-unreported/1",
    category: "footnote",
    markdown: "stray[^9] here\n\n[^1]: alpha\n\nx[^1]\n",
  },
  {
    id: "hunt/reindex-cycle/0",
    category: "footnote",
    markdown: "[^2]: a [^1]\n\nx[^3]\n\n[^1]: b\n[^3]: c [^2]\n",
  },
  {
    id: "hunt/reindex-nested-marker-churn/0",
    category: "footnote",
    markdown:
      "body[^b] text[^a].\n\n[^a]: has [^1] inside\n[^b]: has [^2] inside\n\n[^1]: one\n[^2]: two\n",
  },
  {
    id: "hunt/reindex-orphan-nontransitive/0",
    category: "footnote",
    markdown: "para.\n\n[^1]: uses[^2] inside\n[^2]: two body\n",
  },
  {
    id: "hunt/reindex-renames-bare-prefix-placeholder/0",
    category: "footnote",
    markdown: "text[^3.] and[^1] here\n\n[^1]: one\n",
  },
  {
    id: "hunt/reindex-renames-bare-prefix-placeholder/1",
    category: "footnote",
    markdown: "text[^3.9] here\n\n[^3.9]: nine\n",
  },
  {
    id: "hunt/reindex-renames-invalid-name/0",
    category: "footnote",
    markdown: "[^tick`a] backtick\n\npara text[^2] here\n",
  },
  {
    id: "hunt/reindex-renames-invalid-name/1",
    category: "footnote",
    markdown: "[^real] backtick\n\n[^real]: def\n",
  },
  {
    id: "hunt/reindex-whitespace-name-slot/0",
    category: "footnote",
    markdown: "a[^my note] b[^1]\n\n[^1]: one\n",
  },
  {
    id: "hunt/reindex-whitespace-name-slot/1",
    category: "footnote",
    markdown: "a[^my note] b[^1] c[^2]\n\n[^1]: one\n[^2]: two\n",
  },
  {
    id: "hunt/reindex-whitespace-name-slot/2",
    category: "footnote",
    markdown: "a[^note] b[^1]\n\n[^1]: one\n[^note]: two\n",
  },
  {
    id: "hunt/remove-def-creates-setext-heading/0",
    category: "setext",
    markdown: "closing words[^1]\n[^9]: orphan\n---\n\n[^1]: def\n",
  },
  {
    id: "hunt/remove-def-creates-setext-heading/1",
    category: "setext",
    markdown: "para one[^1] here\n[^1]: def\n---\npara two\n",
  },
  {
    id: "hunt/remove-def-creates-setext-heading/2",
    category: "setext",
    markdown: "closing words[^1]\n\n[^9]: orphan\n---\n\n[^1]: def\n",
  },
  {
    id: "hunt/scan-quote-fence-in-definition/0",
    category: "fenced-code",
    markdown: "[^1]: para\n    > ```\n    > code[^9]\n    > ```\n\nuse[^1]\n",
  },
  {
    id: "hunt/scan-setext-short-underline/0",
    category: "setext",
    markdown: "H\n--\n[^1]: x\n",
  },
  {
    id: "hunt/scan-setext-short-underline/1",
    category: "setext",
    markdown: "use[^1]\n\nH\n--\n[^1]: x\n",
  },
  {
    id: "hunt/scan-setext-short-underline/2",
    category: "setext",
    markdown: "H\n---\n[^1]: x\n",
  },
  {
    id: "hunt/section-heading-escaped-reference-block/0",
    category: "footnote",
    markdown: "x[^9]\n\n[^9]: def\n",
  },
  {
    id: "hunt/setext-paragraph-count-ignores-blocks-scan/0",
    category: "indented-code",
    markdown: "[ref]: /url\npara\n===\n    code[^7]\n",
  },
  {
    id: "hunt/setext-paragraph-count-ignores-blocks-scan/1",
    category: "setext",
    markdown: "[ref]: /url\npara\n===\nx\n",
  },
  {
    id: "hunt/setext-paragraph-count-ignores-blocks-scan/2",
    category: "indented-code",
    markdown: "%%\nhidden\n%%\npara\n===\n    code[^7]\n",
  },
  {
    id: "hunt/setext-paragraph-count-ignores-blocks-scan/3",
    category: "indented-code",
    markdown: "[^1]: body\npara\n===\n    code[^7]\n",
  },
  {
    id: "hunt/setext-paragraph-count-ignores-blocks-scan/4",
    category: "setext",
    markdown: "[ref]: /url\npara\n===\n",
  },
  {
    id: "hunt/setext-paragraph-count-ignores-blocks/0",
    category: "setext",
    markdown: "# H\npara\n===\n[^1]: x\n",
  },
  {
    id: "hunt/setext-paragraph-count-ignores-blocks/1",
    category: "setext",
    markdown: "---\npara\n===\n[^1]: x\n",
  },
  {
    id: "hunt/setext-paragraph-count-ignores-blocks/2",
    category: "table",
    markdown: "| a | b |\n| - | - |\npara\n===\n[^1]: x\n",
  },
  {
    id: "hunt/setext-paragraph-count-ignores-blocks/3",
    category: "setext",
    markdown: "[ref]: /url\npara\n===\n[^1]: x\n",
  },
  {
    id: "hunt/setext-paragraph-count-ignores-blocks/4",
    category: "blockquote",
    markdown: "> # H\n> para\n> ===\n> [^1]: x\n",
  },
  {
    id: "hunt/setext-underline-makes-heading/0",
    category: "setext",
    markdown: "[^1]: x\n===\n\nuse[^1]\n",
  },
  {
    id: "hunt/setext-underline-makes-heading/1",
    category: "setext",
    markdown: "[^1]: x\n---\n\nuse[^1]\n",
  },
  {
    id: "hunt/setext-underline-makes-heading/2",
    category: "blockquote",
    markdown: "> [^1]: x\n> ===\n\nuse[^1]\n",
  },
  {
    id: "hunt/setext-underline-makes-heading/3",
    category: "setext",
    markdown: "para\n[^1]: a\n===\n\nx[^1]\n",
  },
  {
    id: "hunt/setext-underline-makes-heading/4",
    category: "setext",
    markdown: "[^1]: x\n\n===\n\nuse[^1]\n",
  },
  {
    id: "hunt/setext-underline-makes-heading/5",
    category: "indented-code",
    markdown: "[^1]: x\n    y\n===\n\nuse[^1]\n",
  },
  {
    id: "hunt/setext-underline-makes-heading/6",
    category: "setext",
    markdown: "para\nmore\n===\n[^2]: b\n\nx[^2]\n",
  },
  {
    id: "hunt/setext-underline-makes-heading/7",
    category: "setext",
    markdown: "text\n===\n[^2]: b\n\nx[^2]\n",
  },
  {
    id: "hunt/setext-underline-makes-heading/8",
    category: "table",
    markdown: "text\n| a | b |\n| --- | --- |\n| c | d |\n",
  },
  {
    id: "hunt/setext-underline-makes-heading/9",
    category: "table",
    markdown: "- item\n| a | b |\n| --- | --- |\n",
  },
  {
    id: "hunt/setext-underline-makes-heading/10",
    category: "table",
    markdown: "text\n\n| a | b |\n| --- | --- |\n",
  },
  {
    id: "hunt/setext-underline-makes-heading/11",
    category: "table",
    markdown: "[^1]: x\n| a | b |\n| --- | --- |\n",
  },
  {
    id: "hunt/setext-underline-makes-heading/12",
    category: "table",
    markdown: "[^1]: x\nlazy\n| a | b |\n| --- | --- |\n",
  },
  {
    id: "hunt/setext-underline-under-definition-paragraph/0",
    category: "setext",
    markdown: "[^1]: body\nlazy\n===\n[^2]: x\n",
  },
  {
    id: "hunt/setext-underline-under-definition-paragraph/1",
    category: "indented-code",
    markdown: "[^1]: x\n    y\n===\n[^2]: z\n",
  },
  {
    id: "hunt/setext-underline-under-definition-paragraph/2",
    category: "indented-code",
    markdown: "[^1]: x\n    y\n===\n    z[^9]\n",
  },
  {
    id: "hunt/setext-underline-under-definition-paragraph/3",
    category: "indented-code",
    markdown: "[^1]: x\n    y\n===\n\n    z[^9]\n",
  },
  {
    id: "hunt/setext-underline-under-definition-paragraph/4",
    category: "indented-code",
    markdown: "[^1]: body\nlazy\n===\n    z[^9]\n",
  },
  {
    id: "hunt/short-form-comment/0",
    category: "html-comment",
    markdown: "x <!-->\nreal[^1]\n",
  },
  {
    id: "hunt/short-form-comment/1",
    category: "html-comment",
    markdown: "x <!--->\nreal[^1]\n",
  },
  {
    id: "hunt/short-form-comment/2",
    category: "html-comment",
    markdown: "x <!--> [^9]\nreal[^1]\n",
  },
  {
    id: "hunt/stranded-frontmatter/0",
    category: "setext",
    markdown: "[^1]: def\n---\ntext[^1]\n---\nmore\n",
  },
  {
    id: "hunt/stranded-frontmatter/1",
    category: "setext",
    markdown: "[^9]: orphan\n---\ntext[^1]\n---\n\n[^1]: def\n",
  },
  {
    id: "hunt/table-escape-offset/0",
    category: "footnote",
    markdown: "\n\n[^note]: \n",
  },
  {
    id: "hunt/table-under-label-after-block-line/0",
    category: "html-comment",
    markdown: "<!--\nc\n-->\n[^1]: body\n| a | b |\n| --- | --- |\n",
  },
  {
    id: "hunt/table-under-label-after-block-line/1",
    category: "table",
    markdown: "$$\nm\n$$\n[^1]: body\n| a | b |\n| --- | --- |\n",
  },
  {
    id: "hunt/table-under-label-after-block-line/2",
    category: "table",
    markdown: "-      item\n[^1]: body\n| a | b |\n| --- | --- |\n",
  },
  {
    id: "hunt/table-under-label-after-block-line/3",
    category: "table",
    markdown: "[foo]: /url\n[^1]: body\n| a | b |\n| --- | --- |\n",
  },
  {
    id: "hunt/table-under-label-after-block-line/4",
    category: "table",
    markdown: "prose\n[^1]: lazy label\n| a | b |\n| --- | --- |\n",
  },
  {
    id: "hunt/table-under-label-after-block-line/5",
    category: "table",
    markdown: "prose\n\n[^1]: body\n| a | b |\n| --- | --- |\n",
  },
  {
    id: "hunt/table-under-lazy-label-phantom-definition/0",
    category: "table",
    markdown: "prose text\n[^1]: lazy\n| a | b |\n| --- | --- |\n[^2]: under\n",
  },
  {
    id: "hunt/table-under-lazy-label-phantom-definition/1",
    category: "table",
    markdown: "para\n\n[^1]: real\n| a | b |\n| --- | --- |\n",
  },
  {
    id: "hunt/table-under-percent-closer-tail/0",
    category: "comment",
    markdown: "%%\nhidden\n%% tail\n| a | b |\n| --- | --- |\n| c | d |\n",
  },
  {
    id: "hunt/table-under-percent-closer-tail/1",
    category: "comment",
    markdown:
      "%%\nhidden\n%% tail\n| a | b |\n| --- | --- |\n[^1]: def\n\nuse[^1]\n",
  },
  {
    id: "hunt/table-under-percent-closer-tail/2",
    category: "comment",
    markdown: "%%\nhidden\n%%\n| a | b |\n| --- | --- |\n",
  },
  {
    id: "hunt/table-under-percent-closer-tail/3",
    category: "comment",
    markdown: "%% c %%\n| a | b |\n| --- | --- |\n",
  },
  {
    id: "hunt/thin-indent-continuation-swallowed/0",
    category: "footnote",
    markdown: "[^9]: stray\n\n   important prose\n\ntext\n",
  },
  {
    id: "hunt/thin-indent-continuation-swallowed/1",
    category: "footnote",
    markdown: "intro\n\n[^1]: def\n\n   important prose\n\ntail[^1]\n",
  },
  {
    id: "hunt/thin-indent-continuation-swallowed/2",
    category: "footnote",
    markdown: "[^1]: x\n\n   y\n[^2]: z\n",
  },
  {
    id: "hunt/thin-indent-continuation-swallowed/3",
    category: "indented-code",
    markdown: "[^9]: stray\n\n    real continuation\n\ntext\n",
  },
  {
    id: "hunt/thin-indent-continuation-swallowed/4",
    category: "footnote",
    markdown: "[^9]: stray\n lazy continuation\n\ntext\n",
  },
  {
    id: "hunt/undo-notice-promises-second-undo/0",
    category: "table",
    markdown: "| a[^Cell] |\n| --- |\n",
  },
  {
    id: "hunt/wide-gap-quote-markers/0",
    category: "blockquote",
    markdown: "use[^7]\n\n>    > [^7]: seven\n",
  },
  {
    id: "hunt/wide-gap-quote-markers/1",
    category: "blockquote",
    markdown: "use[^7]\n\n>     > [^7]: seven\n",
  },
  {
    id: "hunt/bom-before-line-zero-label/0",
    category: "footnote",
    markdown: "[^1]: def\n\nProse[^1].\n",
  },
  {
    id: "hunt/bom-before-line-zero-label/1",
    category: "footnote",
    markdown: "Prose[^1].\n\n[^1]: def\n",
  },
  {
    id: "hunt/bom-hides-the-frontmatter-block/0",
    category: "setext",
    markdown: "---\nalias: see[^1] here\n---\n\nbody[^2].\n\n[^2]: d\n",
  },
  {
    id: "hunt/bom-hides-the-frontmatter-block/1",
    category: "setext",
    markdown: "---\nfootnote-prefix: 2.\n---\n\nbody\n",
  },
  {
    id: "hunt/code-span-crosses-table/0",
    category: "table",
    markdown: "| `code[^1] |\n| --- |\n| span` |\n",
  },
  {
    id: "hunt/code-span-paragraph-interrupts/0",
    category: "setext",
    markdown: "`code [^2]\n===\ntail` [^1]\n",
  },
  {
    id: "hunt/code-span-paragraph-interrupts/1",
    category: "footnote",
    markdown: "`code [^2]\n-\ntail` [^1]\n",
  },
  {
    id: "hunt/code-span-paragraph-interrupts/2",
    category: "setext",
    markdown: "`code [^2]\n--\ntail` [^1]\n",
  },
  {
    id: "hunt/code-span-paragraph-interrupts/3",
    category: "blockquote",
    markdown: "`code [^2]\n> `tail` [^1]\n",
  },
  {
    id: "hunt/code-span-paragraph-interrupts/4",
    category: "footnote",
    markdown: "`code [^2]\n- `tail` [^1]\n",
  },
  {
    id: "hunt/code-span-paragraph-interrupts/5",
    category: "footnote",
    markdown: "`code [^2]\n1. `tail` [^1]\n",
  },
  {
    id: "hunt/code-span-paragraph-interrupts/6",
    category: "html-comment",
    markdown: "`code [^2]\n<!-- c -->\n`tail` [^1]\n",
  },
  {
    id: "hunt/code-span-paragraph-interrupts/7",
    category: "footnote",
    markdown: "`code [^2]\n2. `tail` [^1]\n",
  },
  {
    id: "hunt/code-span-paragraph-interrupts/8",
    category: "footnote",
    markdown: "Use of a `code\nspan[^7] that wraps` onto the next line.\n",
  },
  {
    id: "hunt/comment-line-table-start/0",
    category: "comment",
    markdown: "%% c %%\n| a | b |\n| --- | --- |\n[^1]: x\n",
  },
  {
    id: "hunt/commented-label-is-a-reference/0",
    category: "comment",
    markdown: "see[^a]\n\n%%\n[^k]: only here\n%%\n\n[^a]: A\n",
  },
  {
    id: "hunt/commented-label-is-a-reference/1",
    category: "comment",
    markdown:
      "prose\n\n%%\n[^dead]: hidden copy\n%%\n\n[^dead]: the real one\n",
  },
  {
    id: "hunt/commented-label-is-a-reference/2",
    category: "comment",
    markdown: "a[^1] b[^2]\n\n%%\n[^9]: dead\n%%\n\n[^1]: A\n[^2]: B\n",
  },
  {
    id: "hunt/commented-label-is-a-reference/3",
    category: "comment",
    markdown: "a[^1]\n\n%%\n[^1]: copy\n%%\n\n[^1]: A\n",
  },
  {
    id: "hunt/commented-label-is-a-reference/4",
    category: "comment",
    markdown: "see[^k]\n\n%%\n[^k]: hidden\n%%\n\n[^k]: real\n",
  },
  {
    id: "hunt/commented-label-is-a-reference/5",
    category: "comment",
    markdown: "see[^k]\n\n%% inline %%\n\n[^k]: real\n",
  },
  {
    id: "hunt/commented-label-is-a-reference/6",
    category: "table",
    markdown:
      "| a | b |\n| - | - |\n| c | d |\n[^1]: x\n| e | f |\n\nref[^1]\n",
  },
  {
    id: "hunt/commented-label-is-a-reference/7",
    category: "table",
    markdown: "| a | b |\n| - | - |\n| c | d |\n[^1]: x\n\nref[^1]\n",
  },
  {
    id: "hunt/commented-label-is-a-reference/8",
    category: "table",
    markdown: "prose\n\n[^1]: x\n| e | f |\n",
  },
  {
    id: "hunt/document-view-memo-mutation/0",
    category: "footnote",
    markdown: "Prose[^1] here.\n\n[^1]: the definition\n",
  },
  {
    id: "hunt/dots-frontmatter-closer/0",
    category: "setext",
    markdown: "---\nfootnote-prefix: 2.\n...\nbody[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/duplicate-prefix-keys/0",
    category: "setext",
    markdown: "---\nfootnote-prefix: 2.\nfootnote-prefix: 3.\n---\nbody\n",
  },
  {
    id: "hunt/empty-list-item-label/0",
    category: "footnote",
    markdown: "-\n[^3]: real definition\n",
  },
  {
    id: "hunt/empty-list-item-label/1",
    category: "footnote",
    markdown: "- item\n[^3]: under the item\n",
  },
  {
    id: "hunt/escaped-bracket-in-label/0",
    category: "footnote",
    markdown: "Alpha.\n\n[^a\\]b]: body\n",
  },
  {
    id: "hunt/fix-lazy-inside-setext-heading/0",
    category: "footnote",
    markdown: "# para\n[^1]: a\n\nx[^1]\n",
  },
  {
    id: "hunt/fix-lazy-label-mid-table/0",
    category: "table",
    markdown: "| a | b |\n| - | - |\n[^1]: x\n| c | d |\n\nref[^1]\n",
  },
  {
    id: "hunt/glued-closer-label/0",
    category: "comment",
    markdown: "%%\nhidden\n%%[^1]: def\ntext[^1] ref\n",
  },
  {
    id: "hunt/glued-closer-label/1",
    category: "comment",
    markdown: "%%\nhidden\n%% [^1]: def\ntext[^1] ref\n",
  },
  {
    id: "hunt/glued-closer-label/2",
    category: "comment",
    markdown: "%%\n[^1]: buried\n%%\ntext[^1] ref\n",
  },
  {
    id: "hunt/html-block-in-container/0",
    category: "blockquote",
    markdown: "> <div>\n> [^1]: x\n\nuse[^1]\n",
  },
  {
    id: "hunt/html-block-in-container/1",
    category: "footnote",
    markdown: "<div>\n[^1]: x\n\nuse[^1]\n",
  },
  {
    id: "hunt/html-block-in-container/2",
    category: "footnote",
    markdown: "- <div>\n  [^1]: x\n\nuse[^1]\n",
  },
  {
    id: "hunt/html-block-in-container/3",
    category: "footnote",
    markdown: "<custom-el>\n[^1]: x\n\nuse[^1]\n",
  },
  {
    id: "hunt/image-alt-reference/0",
    category: "footnote",
    markdown: "![^1](url)\n\n[^1]: one\n",
  },
  {
    id: "hunt/label-after-link-reference-definition/0",
    category: "footnote",
    markdown: "[foo]: /url\n[^1]: x\n",
  },
  {
    id: "hunt/label-after-link-reference-definition/1",
    category: "footnote",
    markdown: "para line\n[^1]: x\n",
  },
  {
    id: "hunt/label-after-link-reference-definition/2",
    category: "footnote",
    markdown: "[foo]: /url\n\n[^1]: x\n",
  },
  {
    id: "hunt/label-after-list-marker/0",
    category: "footnote",
    markdown: "- [^a]: def\n\nuse[^a]\n",
  },
  {
    id: "hunt/label-after-list-marker/1",
    category: "footnote",
    markdown: "- item\n[^a]: def\n",
  },
  {
    id: "hunt/label-inside-html-block/0",
    category: "footnote",
    markdown: "<!DOCTYPE html>\n[^1]: x\n",
  },
  {
    id: "hunt/label-inside-html-block/1",
    category: "footnote",
    markdown: "<script>\n[^1]: x\n</script>\n",
  },
  {
    id: "hunt/label-inside-html-block/2",
    category: "footnote",
    markdown: "<div>\n[^1]: x\n</div>\n",
  },
  {
    id: "hunt/label-inside-html-block/3",
    category: "footnote",
    markdown: "<![CDATA[\n[^1]: x\n]]>\n",
  },
  {
    id: "hunt/label-inside-html-block/4",
    category: "footnote",
    markdown: "<?php\n[^1]: x\n?>\n",
  },
  {
    id: "hunt/label-inside-html-block/5",
    category: "html-comment",
    markdown: "<!-- c -->\n[^1]: x\n",
  },
  {
    id: "hunt/label-inside-html-block/6",
    category: "footnote",
    markdown: "<div>\n\n[^1]: x\n</div>\n",
  },
  {
    id: "hunt/label-under-math-closer/0",
    category: "fenced-code",
    markdown: "t[^1]\npara\n```\ncode\n```\n[^1]: real\n",
  },
  {
    id: "hunt/label-under-math-closer/1",
    category: "html-comment",
    markdown: "t[^1]\npara\n<!--\nc\n-->\n[^1]: real\n",
  },
  {
    id: "hunt/label-under-math-closer/2",
    category: "footnote",
    markdown: "t[^1]\n\n$$\nx = 1\n$$\n[^1]: real\n",
  },
  {
    id: "hunt/label-under-math-closer/3",
    category: "footnote",
    markdown: "t[^1]\npara\n\n$$\nx = 1\n$$\n[^1]: real\n",
  },
  {
    id: "hunt/label-under-math-closer/4",
    category: "footnote",
    markdown: "use[^1] here\n\n$$\nx = 1\n$$\n[^1]: real definition\n",
  },
  {
    id: "hunt/lrd-destination-title-same-line/0",
    category: "footnote",
    markdown: '[foo]:\n/url "title"\n[^1]: x\n',
  },
  {
    id: "hunt/lrd-destination-title-same-line/1",
    category: "footnote",
    markdown: '[foo]: /url\n"t"\n[^1]: x\n',
  },
  {
    id: "hunt/lrd-label-with-open-bracket/0",
    category: "footnote",
    markdown: "[a[b]: /url\n[^1]: x\n",
  },
  {
    id: "hunt/lrd-lazy-continuation-of-definition/0",
    category: "footnote",
    markdown: "[^1]: body\n[foo]: /url\nmore\n\nuse[^1]\n",
  },
  {
    id: "hunt/lrd-title-escapes/0",
    category: "footnote",
    markdown: '[foo]: /url\n"a \\" b"\n[^1]: x\n\nuse[^1]\n',
  },
  {
    id: "hunt/lrd-title-escapes/1",
    category: "blockquote",
    markdown: '[foo]: /url\n> "title"\n[^1]: x\n',
  },
  {
    id: "hunt/lrd-title-escapes/2",
    category: "footnote",
    markdown: "[foo]: /url\n(a(b))\n[^1]: x\n",
  },
  {
    id: "hunt/lrd-without-destination/0",
    category: "footnote",
    markdown: "[foo]:\n[^1]: def\ntext[^1] ref\n",
  },
  {
    id: "hunt/lrd-without-destination/1",
    category: "footnote",
    markdown: "[foo]: /url\n[^1]: def\ntext[^1] ref\n",
  },
  {
    id: "hunt/mixed-eol-noop-rewrite/0",
    category: "footnote",
    markdown: "a[^1]\r\n\r\n[^1]: d\nx\n",
  },
  {
    id: "hunt/name-prefix-yaml-escapes/0",
    category: "setext",
    markdown: '---\nfootnote-prefix: "a\\"b"\n---\ntext\n',
  },
  {
    id: "hunt/name-prefix-yaml-escapes/1",
    category: "setext",
    markdown: "---\nfootnote-prefix: 'it''s'\n---\ntext\n",
  },
  {
    id: "hunt/obsidian-comments/0",
    category: "comment",
    markdown: "x[^1]\n\n%%\n[^1]: def\n%%\nafter\n",
  },
  {
    id: "hunt/obsidian-comments/1",
    category: "comment",
    markdown: "x[^1]\n\n%%\n[^1]: def\n%%\n",
  },
  {
    id: "hunt/obsidian-comments/2",
    category: "comment",
    markdown: "x[^1]\n\n%%\nhidden[^2]\n%%\n\n[^1]: one\n[^2]: two\n",
  },
  {
    id: "hunt/obsidian-comments/3",
    category: "comment",
    markdown: "%%\nx[^9]\n%%\nthen[^8]\n\n[^8]: A\n[^9]: B\n",
  },
  {
    id: "hunt/obsidian-comments/4",
    category: "comment",
    markdown: "%%x[^9]%% then[^8]\n\n[^8]: A\n[^9]: B\n",
  },
  {
    id: "hunt/obsidian-comments/5",
    category: "comment",
    markdown: "x[^1]\n\n%%\n[^1]: dead\n%%\n",
  },
  {
    id: "hunt/obsidian-comments/6",
    category: "comment",
    markdown: "x[^1]\n\n%%text\n[^1]: dead\n%%\n",
  },
  {
    id: "hunt/obsidian-comments/7",
    category: "comment",
    markdown: "x[^1]\n\n   %%\n[^1]: dead\n%%\n",
  },
  {
    id: "hunt/obsidian-comments/8",
    category: "blockquote",
    markdown: "x[^1]\n\n> %%\n> [^1]: dead\n> %%\n",
  },
  {
    id: "hunt/obsidian-comments/9",
    category: "comment",
    markdown: "x[^1]\n\n- %%\n  [^1]: dead\n  %%\n",
  },
  {
    id: "hunt/obsidian-comments/10",
    category: "comment",
    markdown: "x[^1]\n\n1. %%\n   [^1]: dead\n   %%\n",
  },
  {
    id: "hunt/obsidian-comments/11",
    category: "comment",
    markdown: "---\ntitle: t\n---\n%%\n[^1]: dead\n%%\nx[^1]\n",
  },
  {
    id: "hunt/obsidian-comments/12",
    category: "comment",
    markdown: "x[^1]\n\n%%\n\n[^1]: dead\n\n%%\n",
  },
  {
    id: "hunt/obsidian-comments/13",
    category: "comment",
    markdown: "text %% literal\n\n[^1]: def\n\nx[^1]\n",
  },
  {
    id: "hunt/obsidian-comments/14",
    category: "comment",
    markdown: "%% a %% b %%\n\n[^1]: def\n\nx[^1]\n",
  },
  {
    id: "hunt/obsidian-comments/15",
    category: "comment",
    markdown: "%%%% x[^1]\n\n[^1]: def\n",
  },
  {
    id: "hunt/obsidian-comments/16",
    category: "indented-code",
    markdown: "x[^1]\n\n    %%\n[^1]: def\n    %%\n",
  },
  {
    id: "hunt/obsidian-comments/17",
    category: "comment",
    markdown: "%%\nh `%%` after\n\n[^1]: def\n\nx[^1]\n",
  },
  {
    id: "hunt/obsidian-comments/18",
    category: "comment",
    markdown: "%% `%%` x[^1]\n\n[^1]: def\n",
  },
  {
    id: "hunt/obsidian-comments/19",
    category: "comment",
    markdown: "x[^1] y[^2]\n\n%%\nh\n%%\n[^1]: one\n[^2]: two\n",
  },
  {
    id: "hunt/obsidian-comments/20",
    category: "comment",
    markdown: "%%\nhidden\nend %% after[^2]\n\n[^2]: two\n",
  },
  {
    id: "hunt/obsidian-comments/21",
    category: "blockquote",
    markdown: "x[^1]\n\n> %%\n> [^1]: dead\n\n[^1]: live\n",
  },
  {
    id: "hunt/obsidian-comments/22",
    category: "comment",
    markdown: "x[^1]\n\n%%\n[^1]: dead\n\nmore\n\n[^1]: also dead\n",
  },
  {
    id: "hunt/obsidian-comments/23",
    category: "indented-code",
    markdown:
      "x[^1]\n\n[^1]: def\n    %%\n    hidden[^2]\n    %%\n\n[^2]: two\n",
  },
  {
    id: "hunt/obsidian-comments/24",
    category: "footnote",
    markdown: "\n\n[^2]: \n",
  },
  {
    id: "hunt/obsidian-comments/25",
    category: "comment",
    markdown: "a[^1]\n\n[^1]: def\n\ntail\n%%\nopen\n",
  },
  {
    id: "hunt/obsidian-comments/26",
    category: "comment",
    markdown: "x[^1]\n\n%% c %%\n[^1]: def\n",
  },
  {
    id: "hunt/obsidian-comments/27",
    category: "html-comment",
    markdown: "x[^1]\n\n<!-- c -->\n[^1]: def\n",
  },
  {
    id: "hunt/obsidian-comments/28",
    category: "html-comment",
    markdown: "x[^1]\n\n<!--\nc\n-->\n[^1]: def\n",
  },
  {
    id: "hunt/obsidian-comments/29",
    category: "indented-code",
    markdown:
      "x[^1] y[^2]\n\n[^1]: def\n    <!-- a\n    b -->\n    more\n[^2]: two\n",
  },
  {
    id: "hunt/ordered-item-under-definition/0",
    category: "footnote",
    markdown: "text[^1] here\n\n[^1]: body\n2. item text\n",
  },
  {
    id: "hunt/ordered-item-under-definition/1",
    category: "indented-code",
    markdown: "text[^1] here\n\n[^1]: body\n2. item text\n\n    chunk\n",
  },
  {
    id: "hunt/ordered-item-under-definition/2",
    category: "indented-code",
    markdown: "text[^1] here\n\n[^1]: body\n1. item text\n\n    chunk\n",
  },
  {
    id: "hunt/ordered-zero-interrupts-paragraph/0",
    category: "footnote",
    markdown: "a `code\n01. [^1] x\nspan`\n",
  },
  {
    id: "hunt/ordered-zero-interrupts-paragraph/1",
    category: "footnote",
    markdown: "a `code\n1. [^1] x\nspan`\n",
  },
  {
    id: "hunt/orphan-alert-and-residue/0",
    category: "footnote",
    markdown: "text\n\n[^a]: uses[^b]\n[^b]: chained\n",
  },
  {
    id: "hunt/orphan-alert-and-residue/1",
    category: "footnote",
    markdown: "a[^1]\n\n[^1]: one\n\n[^orphan]: stray\n",
  },
  {
    id: "hunt/orphan-alert-and-residue/2",
    category: "footnote",
    markdown: "a[^1]\n\n[^1]: one\n\n[^1]: dup\n",
  },
  {
    id: "hunt/questions/0",
    category: "footnote",
    markdown: "a `code\nspan[^7] more` b\nreal[^1]\n",
  },
  {
    id: "hunt/questions/1",
    category: "html-comment",
    markdown: "<!-- old[^7] -->\nreal[^1]\n",
  },
  {
    id: "hunt/quoted-definition-column0-tail/0",
    category: "blockquote",
    markdown: "> [^1]: quoted def\nplain column-0 line\n[^2]: second\n\ntail\n",
  },
  {
    id: "hunt/quoted-definition-column0-tail/1",
    category: "blockquote",
    markdown: "> [^1]: quoted def\nplain column-0 line\n\ntail\n",
  },
  {
    id: "hunt/quoted-definition-column0-tail/2",
    category: "blockquote",
    markdown: "> [^1]: quoted def\nplain one\nplain two\n\ntail[^1]\n",
  },
  {
    id: "hunt/quoted-definition-column0-tail/3",
    category: "blockquote",
    markdown: "> [^1]: quoted def\nplain one\n# H\n\ntail[^1]\n",
  },
  {
    id: "hunt/quoted-definition-column0-tail/4",
    category: "blockquote",
    markdown:
      "> [^1]: quoted def\nplain column-0 line\n    chunk[^9]\n\ntail[^1]\n",
  },
  {
    id: "hunt/quoted-definition-column0-tail/5",
    category: "blockquote",
    markdown:
      "> [^1]: quoted def\nplain column-0 line\n\n    chunk[^9]\n\ntail[^1]\n",
  },
  {
    id: "hunt/quoted-definition-column0-tail/6",
    category: "blockquote",
    markdown:
      "> [^1]: quoted def\n> quoted lazy\nplain column-0 line\n[^2]: second\n\ntail[^1] and[^2]\n",
  },
  {
    id: "hunt/setext-legacy-heading-migration/0",
    category: "setext",
    markdown: "Footnotes\n---\n",
  },
  {
    id: "hunt/setext-legacy-heading-migration/1",
    category: "setext",
    markdown: "Footnotes\n===\n",
  },
  {
    id: "hunt/setext-line-under-definition/0",
    category: "indented-code",
    markdown: "[^1]: x\n    y\n--\n\nuse[^1]\n",
  },
  {
    id: "hunt/setext-line-under-definition/1",
    category: "indented-code",
    markdown: "[^1]: x\n    y\n---\n\nuse[^1]\n",
  },
  {
    id: "hunt/setext-line-under-definition/2",
    category: "indented-code",
    markdown: "para[^1].\n\n[^1]: x\n    y\n===\n",
  },
  {
    id: "hunt/setext-mixed-definition-tail/0",
    category: "indented-code",
    markdown: "[^1]: body\n    cont\npara\n===\n    code[^9]\n",
  },
  {
    id: "hunt/setext-underline-trailing-tab/0",
    category: "indented-code",
    markdown: "para\n===\t\n[^1]: x\n\ntext[^1]\n",
  },
  {
    id: "hunt/table-delimiter-cell-count/0",
    category: "table",
    markdown: "| a | b |\n| --- |\n[^1]: x\n",
  },
  {
    id: "hunt/table-rows-on-label-line/0",
    category: "table",
    markdown: "[^1]: | a | b |\n| --- | --- |\n| c | d |\n\ntext[^1]\n",
  },
  {
    id: "hunt/table-rows-on-label-line/1",
    category: "indented-code",
    markdown: "[^1]: | a | b |\n    | --- | --- |\n    | c | d |\n\ntext[^1]\n",
  },
  {
    id: "hunt/unclosed-region-at-document-level/0",
    category: "html-comment",
    markdown: "x <!--\n\nlive[^1] here\n",
  },
  {
    id: "hunt/unclosed-region-at-document-level/1",
    category: "blockquote",
    markdown: "x <!--\n> > [^a]: def\n\nuse[^a]\n",
  },
  {
    id: "hunt/unclosed-region-at-document-level/2",
    category: "html-comment",
    markdown: "x <!--\n\nafter\n",
  },
  {
    id: "hunt/unclosed-region-at-document-level/3",
    category: "misc",
    markdown: "x $$\n\nafter\n",
  },
  {
    id: "hunt/unclosed-region-at-document-level/4",
    category: "html-comment",
    markdown: "x <!--\nhidden\n--> live[^1]\n",
  },
  {
    id: "hunt/unclosed-region-at-document-level/5",
    category: "html-comment",
    markdown: "x <!--\n\nhidden[^1]\n\n--> after\n",
  },
  {
    id: "hunt/unverified-reading-view-shapes/0",
    category: "footnote",
    markdown: "<span>\nbody [^1] here\n</span>\n\n[^1]: def\n",
  },
  {
    id: "hunt/unverified-reading-view-shapes/1",
    category: "footnote",
    markdown: "para[^1].\n\n[^1]: body\nmore lazy\n",
  },
  {
    id: "hunt/wide-gap-marker-under-prose/0",
    category: "footnote",
    markdown: "prose line\n-      item[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/wide-gap-marker-under-prose/1",
    category: "footnote",
    markdown: "prose line\n\n-      item[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/wide-gap-marker-under-prose/2",
    category: "footnote",
    markdown: "prose line\n1.      item[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/wide-gap-marker-under-prose/3",
    category: "footnote",
    markdown: "prose line\n10.      item[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/wide-gap-marker-under-prose/4",
    category: "footnote",
    markdown: "prose line\n\n10.      item[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/wide-gap-marker-under-prose/5",
    category: "indented-code",
    markdown: "-      item[^1]\n       more[^2]\n\n[^1]: d\n[^2]: e\n",
  },
  {
    id: "hunt/wide-gap-marker-under-prose/6",
    category: "footnote",
    markdown: "-    item[^1]\n\n[^1]: d\n",
  },
  {
    id: "hunt/wide-gap-marker-under-prose/7",
    category: "footnote",
    markdown: "prose line\n-  item[^1]\n\n[^1]: d\n",
  },
];
