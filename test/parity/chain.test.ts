import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { renderOurs, renderWith } from "./chain.js";

/**
 * The seam between this package and `rehype-obsidian`.
 *
 * Everything else here projects from mdast, which is the right call for
 * measuring a parser but leaves the hand-off untested: this package emits a
 * node, `remark-rehype` turns it into hast, `rehype-raw` re-parses that
 * through HTML, and only then does `rehype-obsidian` see it. Each step can
 * change what the next one receives.
 *
 * That is not hypothetical. `mdast-util-to-hast` sets `data-footnote-ref` to
 * the boolean `true` and `rehype-raw` hands it on as the empty string, so a
 * strict `=== true` check downstream passed every unit test on both sides and
 * silently did nothing in the real chain.
 *
 * `renderOurs` runs the pinned Quartz pipeline end to end. It existed from
 * the first commit and nothing ever called it.
 */
describe("the rendered chain", () => {
  it("keeps a reference its definition resolves", async () => {
    const html = await renderOurs("a[^1]\n\n[^1]: body\n");
    expect(html).toContain("user-content-fn-1");
    expect(html).toContain("<sup");
  });

  it("renders a callout as a container carrying its title", async () => {
    const html = await renderOurs("> [!note] Title\n> Body\n");
    expect(html).toContain("Title");
    expect(html).toContain("Body");
  });

  it("keeps a wikilink's display text", async () => {
    expect(await renderOurs("[[target|shown]]\n")).toContain("shown");
  });

  it("renders math without leaking its delimiters", async () => {
    expect(await renderOurs("$x^2$\n")).not.toContain("$x^2$");
  });

  /**
   * Was a live crash, and the reason this file exists.
   *
   * Three transforms re-parsed a fragment with `self.runSync`, where `self`
   * is the whole processor -- and `runSync` refuses the moment that processor
   * holds an async plugin, which `rehype-obsidian` is. A task list therefore
   * threw in the real Quartz chain while every mdast-level test passed, since
   * the harness builds a markdown-only processor where nothing is async.
   */
  it.each([
    ["a task list item", "- [x] done\n", "task-list"],
    ["a comment with a tail", "%%\nx\n%% tail\n", "tail"],
    ["a definition under a table", "| a |\n| --- |\n[^1]: x\n", "table"],
  ])("renders %s through the full chain", async (_name, markdown, expected) => {
    const html = await renderOurs(markdown);
    expect(html).toContain(expected);
  });
});

/**
 * The assertions above hold against the released `rehype-obsidian`, which is
 * what `npm install` resolves. These do not: they cover behaviour added to
 * the sibling package in the same change as this one, and the two release
 * together.
 *
 * Rather than weaken them to whatever is currently published, they run
 * against a locally built sibling when one is present — the state a
 * maintainer working across both repos is already in — and skip otherwise.
 * CI gets them by checking out and building the sibling first.
 */
const sibling = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../rehype-obsidian/dist/index.js",
);

describe.skipIf(!fs.existsSync(sibling))(
  "the rendered chain, against a built sibling",
  () => {
    it("bares a footnote reference nothing defines", async () => {
      const html = await renderWith(sibling, "a[^1]\n");
      expect(html).toContain("a1");
      expect(html).not.toContain("user-content-fn-1");
    });

    it("closes the numbering gap a bared marker leaves", async () => {
      const html = await renderWith(
        sibling,
        "see [^a] and [^b]\n\n[^b]: only b\n",
      );
      expect(html).toContain("see a and");
      expect(html).toMatch(/<sup[^>]*>[\s\S]*?>1</);
    });
  },
);
