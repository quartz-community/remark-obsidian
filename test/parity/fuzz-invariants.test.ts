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
 * that stops failing, so a fix has to remove its seeds. 373 is the one left of 31: under
 * `strict`, `> [!note] $$y^2` / `y^2$$ ` / `===` puts a formula across the title's line end over
 * a lazy setext underline, which `legacy` (and Obsidian) read as a heading outside the callout.
 */
const KNOWN: Readonly<Record<number, string>> = {
  373: "strict quartz-strict",
};

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
