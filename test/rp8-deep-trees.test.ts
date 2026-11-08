/**
 * A deep tree survives the walk from remark-parse 8's nodes to this package's.
 *
 * `convert` used to recurse at three frames per level, and a nested list is two levels per
 * nesting, so it overflowed long before the reader did. `"- ".repeat(n)` reaches that depth in
 * milliseconds, where the indented shape in `test/pathological` takes seconds, because the
 * reader is roughly cubic on it. 1,000 levels sits between the old walk's limit (about 600) and
 * the reader's own (about 1,300).
 */
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import remarkObsidian from "../src/index.js";
import { parseLegacy8, type LegacyOptions } from "../src/rp8/adapt.js";
import { SHAPES } from "./pathological/shapes.js";

const OPTIONS: LegacyOptions = {
  comments: true,
  callouts: true,
  wikilinks: true,
  frontmatter: true,
  math: true,
  highlights: true,
  tags: true,
  inlineFootnotes: true,
  customTaskChars: true,
  positionedBreaks: true,
  keepComments: true,
  parseComments: false,
  lineOffsets: true,
  bareFootnoteRefs: false,
  bomOffsets: false,
};

const DEPTH = 1_000;

interface Tree {
  type: string;
  value?: string;
  children?: Tree[];
  position?: { start: { offset?: number } };
}

/** Every node, without recursing: the test must not overflow where the code under it does not. */
function nodes(root: unknown): Tree[] {
  const all = [root as Tree];
  for (let at = 0; at < all.length; at++)
    all.push(...(all[at]!.children ?? []));
  return all;
}

const count = (root: unknown, type: string): number =>
  nodes(root).filter((node) => node.type === type).length;

const parsePublic = (doc: string, preset: "legacy" | "strict" = "legacy") => {
  const processor = unified().use(remarkParse).use(remarkObsidian, { preset });
  return processor.runSync(processor.parse(doc), doc);
};

describe("deep trees under legacy", () => {
  const doc = `${"- ".repeat(DEPTH)}s`;

  it("converts a list 1,000 levels deep, through parseLegacy8", () => {
    const tree = parseLegacy8(doc, OPTIONS);
    expect(count(tree, "list")).toBe(DEPTH);
    expect(count(tree, "listItem")).toBe(DEPTH);
    const leaf = nodes(tree).find((node) => node.value === "s");
    expect(leaf?.position?.start.offset).toBe(doc.length - 1);
  });

  it("converts the same list through the public API", () => {
    const tree = parsePublic(doc);
    expect(count(tree, "list")).toBe(DEPTH);
    expect(nodes(tree).filter((node) => node.value === "s")).toHaveLength(1);
  });

  it("keeps original offsets on a deep list after a line ending", () => {
    const crlf = `x\r\n\r\n${doc}`;
    const tree = parseLegacy8(crlf, OPTIONS);
    expect(count(tree, "list")).toBe(DEPTH);
    const leaf = nodes(tree).find((node) => node.value === "s");
    expect(leaf?.position?.start.offset).toBe(crlf.length - 1);
  });

  it("converts callouts nested on their title lines", () => {
    const tree = parseLegacy8(`${"> [!note] ".repeat(800)}a`, OPTIONS);
    expect(count(tree, "callout")).toBe(800);
  });
});

describe("what the walk carries down", () => {
  it("keeps every reference under an inline footnote literal, at any depth", () => {
    const tree = parseLegacy8("^[a [^1] *b [^1]*]\n\n[^1]: x\n", OPTIONS);
    expect(count(tree, "footnote")).toBe(1);
    expect(count(tree, "footnoteReference")).toBe(0);
    const outside = parseLegacy8("^[a] [^1]\n\n[^1]: x\n", OPTIONS);
    expect(count(outside, "footnoteReference")).toBe(1);
  });

  it("parses a comment's body only when the option keeps it", () => {
    const doc = "%%a *b*%%\n";
    const without = parseLegacy8(doc, OPTIONS);
    expect(count(without, "emphasis")).toBe(0);
    const parsed = parseLegacy8(doc, { ...OPTIONS, parseComments: true });
    expect(count(parsed, "emphasis")).toBe(1);
  });
});

describe("the nested-lists shape", () => {
  // At one space per level the shape read as a single flat list under `legacy`, so it gated no
  // depth at all.
  it.each(["legacy", "strict"] as const)("nests under %s", (preset) => {
    const tree = parsePublic(SHAPES["nested-lists"]!(60), preset);
    expect(count(tree, "list")).toBe(60);
  });
});
