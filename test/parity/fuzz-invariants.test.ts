import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
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
 * that stops failing, so a fix has to remove its seeds. Every one is `format: changes the words`
 * and they are the open items AGENTS.md records: an escape the writer adds (`](#tag` written
 * `]\(#tag`) or a character reference (`&#x20;#tag`) starting or ending a tag, CommonMark
 * emphasis spellings remark-parse 8 reads otherwise (`*\*em\**`), and setext underlines.
 */
const KNOWN: Readonly<Record<number, string>> = {
  104: "legacy strict quartz-legacy quartz-strict",
  122: "legacy quartz-legacy",
  138: "legacy strict quartz-legacy quartz-strict",
  148: "legacy strict quartz-legacy quartz-strict",
  285: "legacy quartz-legacy",
  305: "legacy quartz-legacy",
  310: "strict quartz-strict",
  319: "legacy strict quartz-legacy quartz-strict",
  328: "legacy strict quartz-legacy quartz-strict",
  334: "strict quartz-strict",
  342: "legacy quartz-legacy all-off",
  368: "legacy strict quartz-legacy quartz-strict",
  371: "legacy quartz-legacy all-off",
  373: "strict quartz-strict",
  412: "legacy strict quartz-legacy quartz-strict",
  424: "legacy quartz-legacy",
  430: "legacy strict quartz-legacy quartz-strict",
  455: "strict quartz-strict",
  484: "legacy strict quartz-legacy quartz-strict",
  489: "legacy strict quartz-legacy quartz-strict",
  493: "legacy strict quartz-legacy quartz-strict",
  503: "legacy quartz-legacy all-off",
  506: "legacy quartz-legacy",
  519: "strict quartz-strict",
  537: "legacy strict quartz-legacy quartz-strict",
  550: "legacy quartz-legacy",
  584: "legacy strict quartz-legacy quartz-strict",
  598: "legacy strict quartz-legacy quartz-strict",
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
  ])("still holds: %s (%j under %s)", async (_name, markdown, config) => {
    expect(await invariantViolations(markdown, CONFIGS[config]!)).toEqual([]);
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
