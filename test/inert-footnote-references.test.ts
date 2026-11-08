/**
 * `inertFootnoteRefs`: a reference inside `^[...]` stays a node that refers to nothing.
 *
 * Off, such a reference is text (E3); on, the same reference is a `footnoteReference` with
 * `data: { inert: true }`. The corpus gate at the end holds the two together: turning every
 * inert node back into its source text must give the default tree, node for node and offset for
 * offset. Everything runs under both presets, whose reasons for the text differ (`convert`
 * reverts the reader's node; micromark leaves an undefined one as text and demotes a defined one).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";

import remarkObsidian, { type RemarkObsidianOptions } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const PRESETS = ["legacy", "strict"] as const;

interface AnyNode {
  type: string;
  value?: string;
  identifier?: string;
  label?: string;
  data?: Record<string, unknown>;
  position?: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
  children?: AnyNode[];
}

function read(markdown: string, options: RemarkObsidianOptions): AnyNode {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, options);
  return processor.runSync(
    processor.parse(markdown),
    markdown,
  ) as unknown as AnyNode;
}

function references(tree: AnyNode): AnyNode[] {
  const found: AnyNode[] = [];
  visit(tree as never, "footnoteReference", (node: AnyNode) => {
    found.push(node);
  });
  return found;
}

const inert = (preset: (typeof PRESETS)[number]): RemarkObsidianOptions => ({
  preset,
  inertFootnoteRefs: true,
});

function format(markdown: string, options: RemarkObsidianOptions): string {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, options)
    .use(remarkStringify);
  return processor.stringify(
    processor.runSync(processor.parse(markdown), markdown) as Root,
  );
}

const DEFINED = "\n\n[^1]: d\n";

describe.each(PRESETS)("inertFootnoteRefs under %s", (preset) => {
  it("is off by default", () => {
    for (const markdown of ["^[x [^1] y]", `^[x [^1] y]${DEFINED}`]) {
      const tree = read(markdown, { preset });
      expect(references(tree)).toEqual([]);
      const [paragraph] = tree.children!;
      const kids = paragraph!.children![0]!.children!;
      expect(kids.every((kid) => kid.type === "text")).toBe(true);
      expect(kids.map((kid) => kid.value).join("")).toBe("x [^1] y");
    }
  });

  it.each([
    ["undefined", "^[x [^1] y]", "[^1]"],
    ["defined", `^[x [^1] y]${DEFINED}`, "[^1]"],
    ["in emphasis", "^[*a [^1]*]", "[^1]"],
    ["in a highlight", "^[==a [^1]==]", "[^1]"],
    ["in a link's text", "^[[a [^1]](u)]", "[^1]"],
    ["in a comment", "^[%%[^1]%%]", "[^1]"],
    ["in a nested note", "^[x ^[y [^1]] z]", "[^1]"],
    ["over a line", "^[a\n[^1] y]", "[^1]"],
    ["in a table cell", "| ^[x [^1]] |\n| --- |\n", "[^1]"],
    ["with a label read to its `]`", "^[x [^%%n%%]]", "[^%%n%%]"],
  ])("keeps one %s", (_name, markdown, written) => {
    const [node] = references(read(markdown, inert(preset)));
    expect(node).toMatchObject({ data: { inert: true } });
    const { start, end } = node!.position!;
    expect(markdown.slice(start.offset, end.offset)).toBe(written);
  });

  it("places one over a quote's lines", () => {
    const source = "> ^[a\n> [^1] y]";
    const [node] = references(read(source, inert(preset)));
    expect(node!.position).toMatchObject({
      start: { line: 2, column: 3, offset: 8 },
      end: { line: 2, column: 7, offset: 12 },
    });
  });

  it("names it as a live one is named", () => {
    const [node] = references(read("^[[^Cell]]", inert(preset)));
    expect(node).toMatchObject({ identifier: "cell", label: "Cell" });
  });

  it("leaves a reference outside the note live", () => {
    const source = `a[^1] ^[x [^1]] b[^1]${DEFINED}`;
    const found = references(read(source, inert(preset)));
    expect(found.map((node) => node.data?.inert)).toEqual([
      undefined,
      true,
      undefined,
    ]);
    // A live one is what it is without the option.
    const off = references(read(source, { preset }));
    expect(found[0]).toEqual(off[0]);
    expect(found[2]).toEqual(off[1]);
  });

  it.each([
    ["an escaped opener", "^[x \\[^1\\]]"],
    ["inline code", "^[`[^1]`]"],
    ["a formula", "^[$[^1]$ y]"],
    ["a space in the name", "^[x [^a b]]"],
    ["a wikilink", "^[[[w|^a]] x]"],
  ])("finds none in %s", (_name, markdown) => {
    expect(references(read(markdown, inert(preset)))).toEqual([]);
  });

  it("needs a note", () => {
    const off = { ...inert(preset), inlineFootnotes: false };
    const found = references(read("^[x [^1] y]", off));
    expect(found.filter((node) => node.data?.inert)).toEqual([]);
  });

  it.each([
    ["^[x [^1] y]\n"],
    [`^[x [^1] y]${DEFINED}`],
    ["^[*a [^1]*]\n"],
    ["> ^[a\n> [^1] y]\n"],
    ["^[x [^%%n%%]]\n"],
  ])("writes %j back as it was", (markdown) => {
    expect(format(markdown, inert(preset))).toBe(markdown);
  });
});

/** Back to what it read without the option: an inert reference is its source. */
function flatten(node: AnyNode): AnyNode {
  return {
    ...node,
    ...(node.data?.inert === true && { type: "text" }),
    ...(node.children && { children: node.children.map(flatten) }),
  };
}

/** Types and offsets, with adjacent text as one: what reads the same reads the same here. */
function outline(node: AnyNode): unknown {
  const kids: AnyNode[] = [];
  for (const kid of node.children ?? []) {
    const last = kids[kids.length - 1];
    if (
      last?.type === "text" &&
      kid.type === "text" &&
      last.position &&
      last.position.end.offset === kid.position?.start.offset
    ) {
      kids[kids.length - 1] = {
        ...last,
        position: { start: last.position.start, end: kid.position.end },
      };
    } else kids.push(kid);
  }
  return [
    node.type,
    node.position?.start.offset,
    node.position?.end.offset,
    node.children ? kids.map(outline) : undefined,
  ];
}

/** Every corpus document with an inline footnote to hold one. */
function corpus(): string[] {
  const docs = new Set<string>();
  const goldens = JSON.parse(
    fs.readFileSync(
      path.join(here, "parity", "goldens", "obsidian.json"),
      "utf8",
    ),
  ) as { cases: Record<string, { markdown: string }> };
  for (const entry of Object.values(goldens.cases)) docs.add(entry.markdown);
  const answers = path.join(here, "parity", "referee-answers");
  for (const name of fs
    .readdirSync(answers)
    .filter((file) => file.endsWith(".json"))) {
    const raw: unknown = JSON.parse(
      fs.readFileSync(path.join(answers, name), "utf8"),
    );
    const rows = (Array.isArray(raw) ? raw : Object.values(raw as object)) as {
      text?: string;
    }[];
    for (const row of rows) if (row.text !== undefined) docs.add(row.text);
  }
  return [...docs].filter((doc) => doc.includes("^["));
}

describe("inertFootnoteRefs over the corpus", () => {
  it.each(PRESETS)(
    "adds inert references under %s and moves nothing else",
    (preset) => {
      const moved: string[] = [];
      let kept = 0;
      let unplaced = 0;
      for (const markdown of corpus()) {
        const on = read(markdown, inert(preset));
        let whole = true;
        visit(on as never, (node: AnyNode) => {
          if (node.data?.inert !== true) return;
          kept++;
          if (!node.position) whole = false;
        });
        if (!whole) {
          unplaced++;
          continue;
        }
        if (
          JSON.stringify(outline(flatten(on))) !==
          JSON.stringify(outline(read(markdown, { preset })))
        ) {
          moved.push(JSON.stringify(markdown).slice(0, 120));
        }
      }
      expect(moved).toEqual([]);
      // `>^[` / `>⇥[^x]]` under `strict`: the note's text holds that tab's columns as spaces, so
      // no value aligns with its source, and `bareFootnoteRefTransform` leaves such a node unplaced.
      expect(unplaced).toBe(preset === "strict" ? 2 : 0);
      // The known-positive control: the corpus does hold inert references to flatten.
      expect(kept).toBeGreaterThan(900);
    },
    120_000,
  );
});
