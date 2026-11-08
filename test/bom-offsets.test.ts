import fs from "node:fs";
import path from "node:path";

import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import remarkObsidian, { type RemarkObsidianOptions } from "../src/index.js";
import { strideSample } from "./parity/classify.js";
import type { GoldenCase } from "./parity/types.js";

/**
 * `bomOffsets`: every position indexes the string the caller passed.
 *
 * Off is the default, because Obsidian's cache leaves the mark out and the parity gates measure
 * against the cache (`probe/line-ending/bom-heading` records `heading@0:0-0:3`). The tree is
 * parsed without the mark and moved afterwards: handed one, remark-parse 8 counts it too, but it
 * reads no callout on the mark's line and misplaces what a container holds there.
 *
 * The mark is built with `String.fromCharCode`, since a typed escape has turned into a literal
 * mark in this repo before (AGENTS.md, "traps").
 */
const MARK = String.fromCharCode(0xfeff);

const golden = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "parity/goldens/obsidian.json"),
    "utf8",
  ),
) as { cases: Record<string, GoldenCase> };

function read(markdown: string, options: RemarkObsidianOptions): any {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, options);
  return processor.runSync(processor.parse(markdown), markdown);
}

function findAll(node: any, type: string, found: any[] = []): any[] {
  if (node.type === type) found.push(node);
  for (const child of node.children ?? []) findAll(child, type, found);
  return found;
}

const sliceOf = (markdown: string, node: any): string =>
  markdown.slice(node.position.start.offset, node.position.end.offset);

/**
 * The expected move, applied to every point anywhere in a copy of the tree, so a point the
 * implementation does not reach, or reaches twice, shows up as a difference.
 */
function counted(tree: unknown): any {
  const copy = JSON.parse(JSON.stringify(tree));
  const walk = (value: any): void => {
    if (value === null || typeof value !== "object") return;
    if (typeof value.offset === "number" && typeof value.line === "number") {
      value.offset += 1;
      if (value.line === 1) value.column += 1;
      return;
    }
    for (const key of Object.keys(value)) walk(value[key]);
  };
  const { start } = copy.position ?? {};
  walk(copy);
  // The root is the whole string, mark included, as remark-parse 8 places it.
  if (start) {
    start.offset -= 1;
    start.column -= 1;
  }
  if (copy.data?.lineOffsets?.[1] !== undefined) copy.data.lineOffsets[1] += 1;
  return copy;
}

const PRESETS = ["legacy", "strict"] as const;

describe.each(PRESETS)("bomOffsets under %s", (preset) => {
  const on = { preset, bomOffsets: true };
  const definition = `[^1]: def`;

  it("places a reference where the caller's string holds it, on every line", () => {
    const markdown = `${MARK}a[^1]\n\nb[^1]\n\n${definition}\n`;
    const references = findAll(read(markdown, on), "footnoteReference");
    expect(references.map((node) => sliceOf(markdown, node))).toEqual([
      "[^1]",
      "[^1]",
    ]);
    expect(references[0].position.start).toEqual({
      line: 1,
      column: 3,
      offset: 2,
    });
    // Only the mark's own line gains a column.
    expect(references[1].position.start).toEqual({
      line: 3,
      column: 2,
      offset: 9,
    });
  });

  it("holds over `\\r\\n` and a lone `\\r` together with a mark", () => {
    for (const ending of ["\r\n", "\r"]) {
      const markdown = `${MARK}a[^1]${ending}${ending}b[^1]${ending}${ending}${definition}${ending}`;
      const references = findAll(read(markdown, on), "footnoteReference");
      expect(references.map((node) => sliceOf(markdown, node))).toEqual([
        "[^1]",
        "[^1]",
      ]);
      expect(references[1].position.start.line).toBe(3);
      expect(references[1].position.start.column).toBe(2);
    }
  });

  it("moves a point two nodes share only once", () => {
    // Under `legacy` the empty title and the block on its line hold one point object.
    const markdown = `${MARK}> [!note] [^1]: def\n> [^1]\n`;
    const tree = read(markdown, on);
    expect(
      findAll(tree, "footnoteDefinition").map((n) => sliceOf(markdown, n)),
    ).toEqual(["[^1]: def"]);
    const [title] = findAll(tree, "calloutTitle");
    expect(markdown.slice(title.position.start.offset)).toMatch(
      /^\[\^1\]: def/,
    );
    expect(title.position.end.offset).toBe(title.position.start.offset);
  });

  it("counts the mark in the first line's container column, and only there", () => {
    const tree = read(`${MARK}> a\n> b\n`, on);
    expect(tree.data.lineOffsets).toEqual({ 1: 3, 2: 2 });
    // A line no container holds stays absent: the mark is not a container.
    expect(read(`${MARK}a\n`, on).data.lineOffsets).toEqual({});
  });

  it("leaves the root covering the whole string", () => {
    const markdown = `${MARK}a\n`;
    const { position } = read(markdown, on);
    expect(position.start).toEqual({ line: 1, column: 1, offset: 0 });
    expect(markdown.slice(position.start.offset, position.end.offset)).toBe(
      markdown,
    );
    expect(read(MARK, on).position.end.offset).toBe(1);
  });

  it("reads past a second mark as it reads past the first", () => {
    const markdown = `${MARK}${MARK}a[^1]\n\n${definition}\n`;
    const [reference] = findAll(read(markdown, on), "footnoteReference");
    expect(sliceOf(markdown, reference)).toBe("[^1]");
  });

  it("does nothing to a document with no mark", () => {
    const markdown = `> [!note] t\n> a[^1]\n\n${definition}\n`;
    expect(read(markdown, on)).toEqual(read(markdown, { preset }));
  });

  it("is the mark-less tree with every point moved, over the corpus", () => {
    const documents = Object.values(golden.cases).map((entry) =>
      entry.markdown.startsWith(MARK)
        ? entry.markdown.slice(1)
        : entry.markdown,
    );
    expect(documents.length).toBeGreaterThan(3000);
    // `strict` runs its passes on each, so a stride keeps the push gate quick.
    const sample =
      preset === "legacy" ? documents : strideSample(documents, 600);
    const offenders: string[] = [];
    for (const document of sample) {
      for (const text of [document, document.replace(/\r?\n/gu, "\r\n")]) {
        const got = read(MARK + text, on);
        if (
          JSON.stringify(got) !==
          JSON.stringify(counted(read(text, { preset })))
        ) {
          offenders.push(JSON.stringify(text).slice(0, 80));
        }
      }
    }
    expect(offenders).toEqual([]);
  }, 300_000);
});

describe("bomOffsets off, the default", () => {
  it("keeps `legacy`'s positions in the cache's coordinates", () => {
    const markdown = `${MARK}a[^1]\n\nb[^1]\n\n[^1]: def\n`;
    const references = findAll(read(markdown, {}), "footnoteReference");
    expect(references.map((node) => node.position.start.offset)).toEqual([
      1, 8,
    ]);
    expect(references[0].position.start.column).toBe(2);
  });

  // `strict`'s passes read the source while micromark's offsets leave the mark out, so before
  // the passes were handed the mark-less text a mark changed the READING of 506 of the 3,471
  // recorded cases (107 of them a callout gained or lost). A parse bug, not a position choice.
  const strip = (tree: unknown): string =>
    JSON.stringify(tree, (key, value) =>
      key === "position" || key === "lineOffsets" ? undefined : value,
    );

  it("lets a mark change nothing `strict` reads", () => {
    const callout = "> [!note] T\n> body\n";
    const tree = read(MARK + callout, { preset: "strict" });
    expect(findAll(tree, "callout")).toHaveLength(1);
    const cases = strideSample(Object.values(golden.cases), 400);
    const moved = cases
      .filter(
        (c) =>
          strip(read(MARK + c.markdown, { preset: "strict" })) !==
          strip(read(c.markdown, { preset: "strict" })),
      )
      .map((c) => c.id);
    expect(moved).toEqual([]);
  });

  // A callout's empty title and the block on its line share one point object, and restoring
  // `\r\n` shifted it once per node holding it: the definition sat at 19 instead of 15 (58 of
  // 12,290 corpus, referee and generated documents converted to `\r\n`).
  it("restores `\\r\\n` once per shared point, under legacy", () => {
    const markdown = "a\r\n\r\n> [!note] [^1]: def\r\n";
    const [definition] = findAll(read(markdown, {}), "footnoteDefinition");
    expect(sliceOf(markdown, definition)).toBe("[^1]: def");
  });
});
