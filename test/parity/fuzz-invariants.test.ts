import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";

import remarkObsidian from "../../src/index.js";

import { generate } from "./fuzz/generate.js";
import { CONFIGS, invariantViolations } from "./fuzz/invariants.js";

/**
 * The invariant fuzz, on every push: properties a tree and its rendering must have whatever
 * Obsidian says, over generated documents under every configuration in `CONFIGS`. No recording,
 * so it runs in seconds; `fuzz/invariant-sweep.ts` sweeps any other range by hand, and nightly.
 *
 * Built after two 2.0 defects the differential fuzz could not see -- it runs `legacy` only and
 * compares the tree, not the HTML. Its first runs found and closed: math rendering other than
 * its value (strict), a formatter that grew `$$a\$$b$$` and a quoted definition without bound,
 * an inline footnote losing its line ending, and `\%%`, `\==`, `\#tag` and `[[target\]]`
 * changing meaning when formatted.
 */
const SEEDS = 600;

/**
 * Seeds whose formatting still changes the words, and the configurations it does it under.
 * EXACT in both directions, like the other ceilings here: a new entry fails, and so does one
 * that stops failing, so a fix has to remove its seeds. Empty since seed 373 closed; it held 31.
 */
const KNOWN: Readonly<Record<number, string>> = {};

describe("invariant fuzz", () => {
  it(
    `holds every invariant over ${SEEDS} generated documents, bar the recorded seeds`,
    { timeout: 120_000 },
    async () => {
      const found: string[] = [];
      for (let seed = 0; seed < SEEDS; seed++) {
        const markdown = generate(seed);
        for (const [name, options] of Object.entries(CONFIGS)) {
          for (const violation of await invariantViolations(
            markdown,
            options,
          )) {
            found.push(`${seed} ${name}: ${violation}`);
          }
        }
      }
      const expected = Object.entries(KNOWN).flatMap(([seed, names]) =>
        names
          .split(" ")
          .map((name) => `${seed} ${name}: format: changes the words`),
      );
      expect(found.sort()).toEqual(expected.sort());
    },
  );

  /**
   * The minimal forms the sweep reduced its findings to, each under the configuration that broke
   * it. Most sit outside the seed range above, so without this a regression in one would go
   * unseen until a nightly run happened on it.
   */
  it.each([
    ["$$ fence counted escaped dollars", "$$a\\$$b$$\n", "legacy"],
    ["$$ fence counted escaped dollars", "$$a\\$$b$$\n", "strict"],
    ["escaped %% became a comment", "x \\%%note%% y\n", "legacy"],
    ["escaped == became a highlight", "x \\==mark== y\n", "strict"],
    ["escaped # became a tag", "x \\#tag y\n", "legacy"],
    ["wikilink lost its backslash", "[[target\\]]\n", "legacy"],
    ["wikilink lost its backslash", "[[a#^blk\\]]\n", "strict"],
    [
      "label sliced a container prefix",
      "[^1]: > [!note] [^[[a#^blk\n^blk]]]\n",
      "quartz-strict",
    ],
    ["doubled opener kept an escape", "# [^[[link](u)]\n", "quartz-strict"],
    [
      "bare reference tail kept indent",
      "1. <br>, [^\\[[target]]]\n===\n",
      "quartz-strict",
    ],
    ["math hint went stale", "1. Hello $$\n   Math\n   $$\n2.\n", "strict"],
    ["tag after a bracket pair", "a [x]#t\n", "legacy"],
    ["tag after an escaped caret pair", "[^1]: - \\^[inline]#a/b\n", "strict"],
    ["] inside an inline footnote", "x ^[a\\]b] y\n", "legacy"],
    ["callout title lost its escapes", "> [!note] *em\\*\n", "strict"],
    ["leading space before a tag", "[^1]:     #tag\n", "legacy"],
    ["escaped = closed a highlight", "- [ \n*. ==mark\n===\n", "strict"],
    ["backslash before an encoded space", "*em**\n \\ *\n", "all-off"],
    ["emphasis ending in an escaped *", " \\ _*em\\*_. &amp;\n", "legacy"],
    ["lazy setext under a title", "> [!note] #a/b\n<htt\n===\n", "strict"],
    ["block comment under a paragraph", "1. a\n    %%note\n%%, \n", "strict"],
    ["formula opening on a line end", " , $$y^2$$$$\n  [[$x^2\n", "legacy"],
    [
      "reference inside a literal URL",
      "- ^[i\n\n    del~~_. https://e.test/p^[^[inline]![[i.png|100]]\n",
      "quartz-strict",
    ],
    [
      "wikilink brackets in an inline footnote",
      "1. ^[[[[[target]]]]]\n",
      "legacy",
    ],
    [
      "formula across a title line",
      "> [!note] $$y\ndel~~\n> | $$$$\n",
      "strict",
    ],
    [
      "padded formula",
      "> [!note] $$y\ndel~~\n> [!note] $$\t![[d.pdf#page=3]]]] | <mailto:a@e.test> | $$$$\n",
      "strict",
    ],
    ["& after an encoded space", " &amp;, \n", "legacy"],
    ["& after a later line's space", "#tag\n  &amp;. ==m\n", "all-off"],
    [
      "caret before a reference",
      " ^[in\n1. ^[^blk]\t\\[^1]\n",
      "quartz-strict",
    ],
    [
      "title formula over a lazy setext line",
      "> [!note] $$y^2\ny^2$$ \n===\n",
      "strict",
    ],
    ["label holding [ before an escape", "]]], [^_[^1]_]\n", "quartz-strict"],
    [
      "inline footnote after an unclosed one",
      " ^[in\n#  \n[^[[a|b]]]\n",
      "strict",
    ],
    ["& after a reference", "  *_\n  $x^2$, &amp;, \n", "all-off"],
    ["& before a no-break space", "  &amp;\u00a0\n", "legacy"],
    [
      "emphasis around strikethrough holding emphasis",
      ". _~~*em*~~_\n",
      "strict",
    ],
    ["emphasis around a highlight", "_==**strong==_\n", "strict"],
    [
      "emphasis holding emphasis after strikethrough",
      "_~~_under__\n",
      "strict",
    ],
    [
      "_ against a highlight ending in _",
      "]]] > *==under_==*[[[[a#\n",
      "strict",
    ],
    ["_ against a highlight starting with _", "- *==__under_==*\n", "strict"],
    ["_ straight after a tag", "1. #a/b_***em***_\n", "strict"],
    [
      "footnote label over a quoted line",
      "> [^[[a#^blk]\n00]]\n",
      "quartz-strict",
    ],
    ["reference label in link text", "[[^[[]]]](u)\n", "quartz-strict"],
    [
      "wikilink in link text, strict",
      "| > [!note] https://e.test/p [[a#^blk]]  [^1 **em* > [!note] ==\\_under_== \\ [[[a#^blk]]](u)\t`code` | c |\n",
      "strict",
    ],
    ["bracket pair over lines before a tag", "[^1\n1]#tag\n", "quartz-strict"],
    ["tag text at the start of link text", "[[#tag](u)\n", "strict"],
    ["whitespace opening strong before a tag", "**\t#tag**\u200b*\n", "legacy"],
    ["formula of a backslash", "y^2$$ \\ $$y^2$$\n", "legacy"],
    ["tilde against a strikethrough closer", "~del~~. ~~~~\n", "legacy"],
    ["emphasis around a formula holding *", "_$a*b$_ and *c*\n", "legacy"],
    ["emphasis around an embed holding *", "_![[*em*]]_\n", "legacy"],
    ["emphasis around link text with emphasis", "_[*em*](u)_\n", "legacy"],
    ["a run of =", "======\n", "legacy"],
    ["a run of =", "# ========\n", "strict"],
    ["blank math line in a definition", "[^1]: - $$\n    \n", "strict"],
    ["a line starting ~~~~", " wor\n        ~~~~d\n", "legacy"],
    ["strikethrough content starting ~", " _$#\n        ~~~~del~~\n", "legacy"],
    [
      "callout body after a literal URL",
      "> [!note] [[a#^blk]]\n[link | https://e.te\n",
      "strict",
    ],
    [
      "comment after a blank line in a definition",
      "[^1]: a\n\n    b\n\n    %%note\n",
      "strict",
    ],
    ["caret before a wikilink", "^[[[target\\]]]\n  [^1]\n", "strict"],
    [
      "formula ending in a stepped-over $",
      "- [ ] $x^\nmark==\t$$y^2$$\n",
      "legacy",
    ],
    ["embed of ] in reference text", "| [[![[]]]][^~~#tag~~] [l\n", "legacy"],
    [
      "formula starting a line",
      "  ![\n        $$y^2\n    y^2$$ \\ ~~del\n",
      "strict",
    ],
    [
      "emphasis starting with strong",
      "> %%[[target\\]]%% | _**[^1]**__[link](u)](u)_. 日本語\n",
      "legacy",
    ],
    ["blank code line in a definition", "[^1]: \n    ~~~~\n    \n", "strict"],
    [
      "blank code line in a definition",
      "[^1]: x\n\n    ```\n    a\n      \n    b\n    ```\n",
      "quartz-strict",
    ],
    [
      "escaped text after a reference in a table",
      "| a | b |\n| --- | --- |\n| > > ==mark== **strong**]($x^2$]($$y^2$$ > > [^https://e.test/p]\t![[i.png|100x200]] _under\\_~~del~~ | c |\n",
      "quartz-strict",
    ],
    [
      "reference in a literal URL on a lazy line",
      "![[i\n    [^https://e.test/p]\n",
      "quartz-strict",
    ],
    [
      "wikilink brackets in link text",
      "> > [[[[target]]](link](u)\n",
      "legacy",
    ],
    ["emphasis against strong", "> _under_**strong****~~del~~\n", "legacy"],
    [
      "strong ending in a break and a tag",
      "[^1]: > $~~del~~$]([link\\](u)](strong**\n    > #a/b. $$**strong**$$\n",
      "legacy",
    ],
    ["emphasis around strong around emphasis", "_***strong***_\n", "legacy"],
    ["formula line read as an underline", "> $x\n====\n> $[l\n", "strict"],
    [
      "formula with an escaped dollar over an underline",
      "> $x^2\\$\n====\n> $[l\n",
      "strict",
    ],
    ["footnote label holding * in emphasis", "  _[^*em*]_\n", "legacy"],
    ["strong ending in a tag", "1. __under_**#a/b**\n", "strict"],
    ["embed brackets in link text", "blk]]\t[![[[^1]]]](u)\n", "legacy"],
    ["comment over a lazy setext pair", "> > %%note\nnote%% \n---\n", "strict"],
    [
      "text %% after a comment",
      "> > [[a#\n word, %%note%%%%\n3]]%%\n",
      "strict",
    ],
  ])("still holds: %s (%j under %s)", async (_name, markdown, config) => {
    expect(await invariantViolations(markdown, CONFIGS[config]!)).toEqual([]);
  });

  // Not a property the words check can see either: the formula keeps its words and only turns
  // display. Written with the fence it was read with, a `$` after whitespace inside cannot close.
  it("writes `$a\\$ $b$` back as inline math", () => {
    for (const preset of ["legacy", "strict"] as const) {
      const formatter = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkObsidian, { preset })
        .use(remarkStringify);
      expect(String(formatter.processSync("$a\\$ $b$\n")), preset).toBe(
        "$a\\$ $b$\n",
      );
    }
  });

  // Not a property the words check can see: the parse itself dropped the line ending, so the
  // tree had nothing to lose between passes. Asked of the tree directly instead.
  // An unclosed `^[` used to cost every inline footnote after it, in the whole document: the
  // scan's "no `]` remains" memo ended at its paragraph but applied to every later offset.
  it("reads an inline footnote after an unclosed one in another paragraph", () => {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkObsidian, { preset: "strict" });
    const markdown = "^[a\n\n^[b]\n";
    const tree = processor.runSync(processor.parse(markdown), markdown);
    let notes = 0;
    visit(tree, "footnote", () => {
      notes++;
    });
    expect(notes).toBe(1);
  });

  // A comment's body is read with its container's prefixes stripped, every level of them. One
  // level was stripped, so two quotes deep the body held a quote of its own; the words are the
  // same either way, so the property is asked of the tree.
  it.each([
    ["> > %%a\n> > b%%\n", "a\nb"],
    ["> > x\n y %%a\n> > b%%\n", "a\nb"],
  ])(
    "reads a comment two quotes deep without a quote inside (%j)",
    (markdown, body) => {
      const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkObsidian, { preset: "strict" });
      const tree = processor.runSync(processor.parse(markdown), markdown);
      const comments: Node[] = [];
      visit(tree, "comment", (node: Node) => {
        comments.push(node);
      });
      const inner: string[] = [];
      visit(comments[0]!, (node: Node) => {
        if (node.type === "blockquote") inner.push("blockquote");
        if (node.type === "text")
          inner.push((node as unknown as { value: string }).value);
      });
      expect(inner.join("")).toBe(body);
    },
  );

  // Recorded live (1.15.0): Obsidian indexes a defined `[^2]` written inside a comment, on a
  // label line under text too. The body is parsed after the reference passes, so strict left it
  // as text until the comment's references were resolved on their own.
  it("resolves a defined reference inside a comment, under strict", () => {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkObsidian, { preset: "strict" });
    for (const markdown of [
      "%%\nabc\n[^2]: x\n%%\n\n[^2]: def\n",
      "> > %%\n> > Morewordsend.\n> > [^2]: body text\n\n[^2]: def\n",
    ]) {
      const tree = processor.runSync(processor.parse(markdown), markdown);
      let inside = 0;
      visit(tree, "comment", (comment: Node) => {
        visit(comment, "footnoteReference", () => {
          inside++;
        });
      });
      expect(inside, markdown).toBe(1);
    }
  });

  it("keeps the line ending inside an inline footnote", () => {
    for (const preset of ["legacy", "strict"] as const) {
      const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkObsidian, { preset });
      const markdown = "x ^[a\nb] y\n";
      const tree = processor.runSync(processor.parse(markdown), markdown);
      const values: string[] = [];
      // A `break` is the line ending, which `positionedBreaks` (on under legacy) makes of it.
      visit(tree, "footnote", (node) => {
        visit(node as Node, (inner: Node) => {
          if (inner.type === "break") values.push("\n");
          if (inner.type === "text")
            values.push((inner as unknown as { value: string }).value);
        });
      });
      expect(values.join(""), preset).toBe("a\nb");
    }
  });
});
