/**
 * `keepUndefinedReferences`: a reference this parse found no definition for stays a node.
 *
 * Two corpus gates at the end are the ones that matter. Flattening every kept reference back to
 * its source must give the default tree, node for node and offset for offset, so the option adds
 * these nodes and moves nothing else. And the note with a kept label defined must hold that
 * reference at that span, so the option keeps only what a definition would make a reference.
 * A pass reading micromark's text back under `strict` failed the second, which is why it is
 * `legacy`'s alone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Root } from "mdast";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";

import remarkObsidian, { type RemarkObsidianOptions } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));

interface AnyNode {
  type: string;
  value?: string;
  identifier?: string;
  label?: string;
  alt?: string;
  referenceType?: string;
  title?: string;
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
  visit(tree as never, (node: AnyNode) => {
    if (node.type === "linkReference" || node.type === "imageReference") {
      found.push(node);
    }
  });
  return found;
}

const KEEPING: RemarkObsidianOptions = { keepUndefinedReferences: true };

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

async function html(
  markdown: string,
  options: RemarkObsidianOptions,
): Promise<string> {
  return String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkObsidian, options)
      .use(remarkRehype)
      .use(rehypeStringify)
      .process(markdown),
  );
}

describe("keepUndefinedReferences", () => {
  it("is off by default", () => {
    const tree = read("[a] b", {});
    expect(references(tree)).toEqual([]);
    expect(tree.children![0]!.children).toMatchObject([
      { type: "text", value: "[a] b" },
    ]);
  });

  it.each([
    ["[a] b", "linkReference", "shortcut", "a", "[a]"],
    ["x [a][] y", "linkReference", "collapsed", "a", "[a][]"],
    ["![a] b", "imageReference", "shortcut", "a", "![a]"],
    ["x ![a][] y", "imageReference", "collapsed", "a", "![a][]"],
    ["[a][b] c", "linkReference", "full", "b", "[a][b]"],
    ["[A  B] c", "linkReference", "shortcut", "a b", "[A  B]"],
    ["# h [a]", "linkReference", "shortcut", "a", "[a]"],
    ["| [a] |\n| --- |\n", "linkReference", "shortcut", "a", "[a]"],
    ["- [a]", "linkReference", "shortcut", "a", "[a]"],
    ["> [a]", "linkReference", "shortcut", "a", "[a]"],
    ["^[x [a]]", "linkReference", "shortcut", "a", "[a]"],
    ["%% [a] %%", "linkReference", "shortcut", "a", "[a]"],
    ["[![a]](u)", "imageReference", "shortcut", "a", "![a]"],
    ["[a *b* c] d", "linkReference", "shortcut", "a *b* c", "[a *b* c]"],
  ])("keeps %j", (markdown, type, referenceType, identifier, written) => {
    const [node] = references(read(markdown, KEEPING));
    expect(node).toMatchObject({
      type,
      referenceType,
      identifier,
      data: { defined: false },
    });
    const { start, end } = node!.position!;
    expect(markdown.slice(start.offset, end.offset)).toBe(written);
  });

  it("holds the text of the reference as its children or alt", () => {
    const [link] = references(read("[a *b*] c", KEEPING));
    expect(link!.children!.map((kid) => kid.type)).toEqual([
      "text",
      "emphasis",
    ]);
    const [image] = references(read("![a] c", KEEPING));
    expect(image!.alt).toBe("a");
    expect(image!.children).toBeUndefined();
  });

  it("places a label over a quote's lines", () => {
    const source = "> [a\n> b] c";
    const [node] = references(read(source, KEEPING));
    expect(node).toMatchObject({ identifier: "a b", label: "a\nb" });
    expect(node!.position).toMatchObject({
      start: { line: 1, column: 3, offset: 2 },
      end: { line: 2, column: 5, offset: 9 },
    });
  });

  it("flags only what this parse did not define", () => {
    const source = "[a] [b] [A][] [x][a] [x][b]\n\n[a]: /u\n";
    const found = references(read(source, KEEPING));
    expect(found.map((node) => [node.identifier, node.data?.defined])).toEqual([
      ["a", undefined],
      ["b", false],
      ["a", undefined],
      ["a", undefined],
      ["b", false],
    ]);
    // And a defined one is exactly what it is without the option.
    const [plain] = references(read("[a]\n\n[a]: /u\n", {}));
    const [kept] = references(read("[a]\n\n[a]: /u\n", KEEPING));
    expect(kept).toEqual(plain);
  });

  // Obsidian does not trim a label, so `[a]` defines no `[ a ]`, whatever `identifier` says.
  it("holds what to look up in `label`, not `identifier`", () => {
    const [node] = references(read("[ a ]\n\n[a]: /url\n", KEEPING));
    expect(node).toMatchObject({
      label: " a ",
      identifier: "a",
      data: { defined: false },
    });
  });

  it.each([
    ["an escaped opener", "\\[a] b"],
    ["an escaped closer", "[a\\] b"],
    ["empty brackets", "[] b"],
    ["a footnote's label", "x [^1] y"],
    ["inline code", "`[a]` b"],
    ["a formula", "$[a]$ b"],
    ["a comment kept unparsed", "%% [a] %%"],
    ["a link's text", "[x [a] y](u)"],
    ["a wikilink", "[[a]]"],
  ])("leaves %s alone", (name, markdown) => {
    const options = {
      ...KEEPING,
      ...(name.includes("unparsed") ? { parseComments: false } : {}),
    };
    expect(references(read(markdown, options))).toEqual([]);
  });

  it("leaves what is read before it", () => {
    const callout = read("> [!note] [a] b\n> c", KEEPING);
    expect(callout.children![0]).toMatchObject({
      type: "callout",
      calloutType: "note",
      title: "[a] b",
    });
    expect(references(callout)).toHaveLength(1);

    const tasks = read("- [ ] a\n- [-] b [c]", KEEPING);
    const [item] = tasks.children![0]!.children!;
    expect(item).toMatchObject({ checked: false });
    expect(references(tasks).map((node) => node.identifier)).toEqual(["c"]);

    const tag = read("[a]#t", KEEPING);
    expect(tag.children![0]!.children!.map((kid) => kid.type)).toEqual([
      "linkReference",
      "tag",
    ]);
  });

  // remark-parse 8 reads no reference after an `<a>` left open, whatever defines it.
  it("keeps none where a defined label reads none", () => {
    const source = 'Jump <a name="t"> x\n\n[l] y\n';
    expect(references(read(source, KEEPING))).toEqual([]);
    expect(references(read(`${source}\n[l]: /u\n`, {}))).toEqual([]);
  });

  // remark-parse 8 takes it into the reference; a kept one gives it back as text, so it renders
  // and a format keeps the tree.
  it("gives back a bracket that never closes as text", () => {
    const tree = read("[a][ b", KEEPING);
    const [node] = references(tree);
    expect(node!.position!.end.offset).toBe(3);
    expect(format("[a][ b\n", KEEPING)).toBe("[a]\\[ b\n");
    const shape = (markdown: string): unknown =>
      JSON.stringify(read(markdown, KEEPING), (key, value: unknown) =>
        key === "position" ? undefined : value,
      );
    expect(shape("[a]\\[ b\n")).toBe(shape("[a][ b\n"));
  });
});

describe("keepUndefinedReferences under strict", () => {
  // micromark reads no reference nothing defines, so there is nothing to keep.
  it.each(["[a] b", "x [a][] y", "![a] b", "[a][b] c", "x ^[^[note] y"])(
    "leaves %j as it is without the option",
    (markdown) => {
      const options = { preset: "strict", keepUndefinedReferences: true };
      const plain = { preset: "strict" } as const;
      expect(read(markdown, options as RemarkObsidianOptions)).toEqual(
        read(markdown, plain),
      );
    },
  );
});

describe("keepUndefinedReferences, writing", () => {
  it.each([
    ["[a] b\n"],
    ["x [a][] y\n"],
    ["![a] b\n"],
    ["x ![a][] y\n"],
    ["[a][b] c\n"],
    ["[a *b*] c\n"],
    ["[a\\]] b\n"],
    ["[b&amp;c] d\n"],
    ["[a`] b\n"],
    ["> [a\n> b] c\n"],
  ])("writes %j back as it was", (markdown) => {
    expect(format(markdown, KEEPING)).toBe(markdown);
  });

  // Text was escaped: the label is written bare, which is the source, where the source was bare.
  it.each([
    ["[a] b\n", "[a] b\n", "\\[a] b\n"],
    ["[a]: <b\n", "[a]&#x3A; \\<b\n", "\\[a]: \\<b\n"],
  ])("writes %j differently from text", (markdown, on, off) => {
    expect(format(markdown, KEEPING)).toBe(on);
    expect(format(markdown, {})).toBe(off);
  });

  it("does not write a callout that was not one", () => {
    const written = format(">\n> [!note]\n> x\n", KEEPING);
    expect(read(written, KEEPING).children![0]!.type).toBe("blockquote");
  });

  // `[a]: \<b` is a definition, where the source's `[a]: <b` over a blank line is not.
  it("keeps a line that was no definition from becoming one", () => {
    const written = format("[a]: <b\n\nc\n", KEEPING);
    expect(
      read(written, KEEPING).children!.map((node) => node.type),
    ).not.toContain("definition");
  });
});

describe("keepUndefinedReferences, rendering", () => {
  it("renders a plain one as text", async () => {
    expect(await html("[a] b", KEEPING)).toBe(await html("[a] b", {}));
  });

  // Why a chain that renders should leave it off: `mdast-util-to-hast` resolves by `identifier`,
  // and writes a reference nothing defines back from its label and its type alone.
  it.each([
    ["[ a ]\n\n[a]: /url\n", '<p><a href="/url"> a </a></p>', "<p>[ a ]</p>"],
  ])("renders %j differently from text", async (markdown, on, off) => {
    expect(await html(markdown, KEEPING)).toBe(on);
    expect(await html(markdown, {})).toBe(off);
  });
});

/** Back to what it read without the option: a kept reference's brackets and label are text. */
function flatten(node: AnyNode): AnyNode[] {
  const kept =
    node.data?.defined === false &&
    (node.type === "linkReference" || node.type === "imageReference");
  // A full reference nothing defines is a node either way, and only gains the flag.
  if (kept && node.referenceType !== "full") {
    const { start, end } = node.position!;
    const kids = (node.children ?? []).flatMap(flatten);
    const span = (from: typeof start, to: typeof end): AnyNode => ({
      type: "text",
      position: { start: from, end: to },
    });
    if (kids.length === 0) return [span(start, end)];
    return [
      span(start, kids[0]!.position!.start),
      ...kids,
      span(kids[kids.length - 1]!.position!.end, end),
    ];
  }
  return [
    {
      ...node,
      ...(node.children && { children: node.children.flatMap(flatten) }),
    },
  ];
}

/** Types and offsets, with adjacent text as one: what reads the same reads the same here. */
function outline(node: AnyNode): unknown {
  const kids: AnyNode[] = [];
  for (const kid of node.children ?? []) {
    const last = kids[kids.length - 1];
    if (
      last?.type === "text" &&
      kid.type === "text" &&
      last.position!.end.offset === kid.position!.start.offset
    ) {
      kids[kids.length - 1] = {
        ...last,
        position: { start: last.position!.start, end: kid.position!.end },
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

function corpus(): string[] {
  const goldens = JSON.parse(
    fs.readFileSync(
      path.join(here, "parity", "goldens", "obsidian.json"),
      "utf8",
    ),
  ) as { cases: Record<string, { markdown: string }> };
  return Object.values(goldens.cases).map((entry) => entry.markdown);
}

function kept(tree: AnyNode): AnyNode[] {
  return references(tree).filter((node) => node.data?.defined === false);
}

describe("keepUndefinedReferences over the corpus", () => {
  it("adds references and moves nothing else", () => {
    const moved: string[] = [];
    let count = 0;
    for (const markdown of corpus()) {
      const on = read(markdown, KEEPING);
      count += kept(on).length;
      const [flat] = flatten(on);
      if (
        JSON.stringify(outline(flat!)) !==
        JSON.stringify(outline(read(markdown, {})))
      ) {
        moved.push(JSON.stringify(markdown).slice(0, 120));
      }
    }
    expect(moved).toEqual([]);
    // The known-positive control: the corpus does hold kept references to flatten.
    expect(count).toBeGreaterThan(100);
  }, 120_000);

  // First or last, since an open fence or comment takes a definition after it. `[][` is what the
  // reader takes for a reference with an empty label, which nothing can define.
  it("keeps only what the note with that label defined holds", () => {
    const missing: string[] = [];
    let held = 0;
    for (const markdown of corpus()) {
      for (const node of kept(read(markdown, KEEPING))) {
        const label = String(node.data?.spelledLabel ?? node.label);
        if (label === "") continue;
        const { start, end } = node.position!;
        const definition = `[${label}]: /u`;
        const holds = (source: string, shift: number): boolean =>
          references(read(source, {})).some(
            (other) =>
              other.type === node.type &&
              other.position!.start.offset === start.offset + shift &&
              // A defined one keeps a `[` that never closes in its span; a kept one gives it back.
              (other.position!.end.offset === end.offset + shift ||
                (other.position!.end.offset === end.offset + shift + 1 &&
                  source[end.offset + shift] === "[")),
          );
        if (
          holds(`${markdown}\n\n${definition}\n`, 0) ||
          holds(`${definition}\n\n${markdown}`, definition.length + 2)
        ) {
          held++;
        } else missing.push(JSON.stringify(markdown).slice(0, 120));
      }
    }
    expect(missing).toEqual([]);
    expect(held).toBeGreaterThan(100);
  }, 120_000);

  it("does nothing under strict", () => {
    const moved: string[] = [];
    const on = { preset: "strict", keepUndefinedReferences: true } as const;
    const off = { preset: "strict" } as const;
    for (const markdown of corpus()) {
      if (
        JSON.stringify(read(markdown, on)) !==
          JSON.stringify(read(markdown, off)) ||
        format(markdown, on) !== format(markdown, off)
      ) {
        moved.push(JSON.stringify(markdown).slice(0, 120));
      }
    }
    expect(moved).toEqual([]);
  }, 120_000);
});
