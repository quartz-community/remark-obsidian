/**
 * Deep trees through this package's own walks: the writers' and `strict`'s passes.
 *
 * Each walk here used to recurse once per tree level, so it overflowed on a tree the parser had
 * built. The depths sit between the old walks' limits and what is left, measured in fresh
 * processes on Node 24's default stack:
 *
 * - The writers' walks (parents, adjacent attention, empty strikethrough, the `*`/`_` checks)
 *   overflowed at about 3,000 levels of a comment's parsed body, which the writer itself never
 *   descends into, since it writes a comment from `value`. Now 100,000 levels take 70 ms.
 * - `strict`'s passes overflowed on a quote about 2,800 deep (`obsidianReadingTransform`'s
 *   walk). Now `unist-util-visit`, which the passes and the parse call, overflows at about
 *   5,700.
 *
 * Where the writer DOES descend, `mdast-util-to-markdown` is the limit, not this package: it
 * spends four frames a level in `containerFlow`/`containerPhrasing`, so a list formats to about
 * 520 levels and a quote to about 1,300, under either preset. Nothing here gates those.
 */
import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import remarkObsidian from "../src/index.js";

/** Every node, without recursing: the test must not overflow where the code under it does not. */
function count(root: unknown, type: string): number {
  const all = [root as { type: string; children?: unknown[] }];
  for (let at = 0; at < all.length; at++) {
    all.push(...((all[at]!.children ?? []) as typeof all));
  }
  return all.filter((node) => node.type === type).length;
}

describe("deep trees through the writer's own walks", () => {
  const DEPTH = 20_000;

  it.each(["legacy", "strict"] as const)(
    "writes a comment whose parsed body nests 20,000 deep, under %s",
    (preset) => {
      let body: Record<string, unknown> = { type: "text", value: "a" };
      body = { type: "paragraph", children: [body] };
      for (let level = 0; level < DEPTH; level++) {
        body = {
          type: level % 2 ? "blockquote" : "emphasis",
          children: [body],
        };
      }
      const tree = {
        type: "root",
        children: [{ type: "comment", value: "x", children: [body] }],
      } as unknown as Root;
      const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkObsidian, { preset })
        .use(remarkStringify);
      expect(processor.stringify(tree)).toBe("%%x\n%%\n");
    },
  );
});

describe("deep trees through strict's passes", () => {
  it("runs them over a quote 4,000 deep", () => {
    const doc = `${"> ".repeat(4_000)}a`;
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkObsidian, { preset: "strict" });
    const tree = processor.runSync(processor.parse(doc), doc);
    expect(count(tree, "blockquote")).toBe(4_000);
  }, 30_000);
});
