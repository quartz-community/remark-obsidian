/**
 * `root.data.readsPastEnd` exists so a note can be parsed in parts: while it is `false`, a part
 * read with its next line attached, ending where that next line starts a top-level block, reads
 * as that part of the whole note does. A false negative would silently misread a long note, so
 * that property is what's held here, over the corpus and over generated documents built from
 * definition fragments, because the corpus rarely reaches the hazard. Read without its next line,
 * a part can still differ with the signal false: see "without its next line". Each sweep asserts
 * its counts and carries a known-positive control.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Nodes, Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import remarkObsidian, { type RemarkObsidianOptions } from "../src/index.js";
import { parse8WithOffsets, type Features } from "../src/rp8/reader.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const parse = (md: string, options?: RemarkObsidianOptions): Root =>
  unified().use(remarkParse).use(remarkObsidian, options).parse(md);

const signal = (md: string): boolean | undefined =>
  parse(md, { readsPastEnd: true }).data?.readsPastEnd;

const types = (md: string): string[] => parse(md).children.map((n) => n.type);

const FEATURES: Features = {
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
};

function collectLabels(node: Nodes, into = new Set<string>()): Set<string> {
  if (node.type === "definition") into.add(`link:${node.identifier}`);
  if (node.type === "footnoteDefinition") into.add(`note:${node.identifier}`);
  if ("children" in node) {
    for (const child of node.children ?? []) collectLabels(child, into);
  }
  return into;
}

const everyThird = <T>(items: T[]): T[] =>
  items.filter((_, index) => index % 3 === 0);

function corpus(): string[] {
  const docs: string[] = [];
  const goldens = JSON.parse(
    fs.readFileSync(
      path.join(here, "parity", "goldens", "obsidian.json"),
      "utf8",
    ),
  ) as { cases: Record<string, { markdown: string }> };
  for (const entry of Object.values(goldens.cases)) docs.push(entry.markdown);
  const answers = path.join(here, "parity", "referee-answers");
  for (const name of fs
    .readdirSync(answers)
    .filter((f) => f.endsWith(".json"))) {
    const raw: unknown = JSON.parse(
      fs.readFileSync(path.join(answers, name), "utf8"),
    );
    const rows = (Array.isArray(raw) ? raw : Object.values(raw as object)) as {
      text: string;
    }[];
    for (const row of rows) docs.push(row.text);
  }
  return docs;
}

/** The lines a definition can be cut across, then what a definition can run into. */
const FRAGMENTS = [
  "",
  "[",
  "[a",
  "[a]:",
  "[a]: x",
  "[a]: <x",
  '[a]: x "t',
  '[a]: x "t"',
  "'tit",
  "'tit [^1]",
  "le'",
  "(x",
  "]: x",
  "text",
];
const OTHERS = [
  "",
  "[a]",
  "[a]: <x>",
  '"t"',
  "x)",
  "]",
  "# h",
  "> q",
  "> [a",
  "- i",
  "- [a",
  "    code",
  "|a|b|",
  "|-|-|",
  "a|b",
  "-|-",
  "---",
  "===",
  "%%",
  "%%x%%",
  "$$",
  "```",
  "[^1]: d",
  "    more",
  "[^1]",
  "<div>",
  "<!--",
  "-->",
  '<a href="u">',
  "> [!note] t",
  "[b]: y 'z'",
  "[\\",
];

function generated(count: number, extra: readonly string[] = []): string[] {
  const docs: string[] = [];
  for (const a of FRAGMENTS) {
    for (const b of FRAGMENTS) {
      for (const c of FRAGMENTS) docs.push(`${a}\n${b}\n${c}\nrest\n`);
    }
  }
  const lines = [...FRAGMENTS, ...OTHERS, ...extra];
  let seed = 20261106;
  const below = (n: number): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 4294967296) * n);
  };
  for (let i = 0; i < count; i++) {
    const doc: string[] = [];
    for (let n = 2 + below(8); n > 0; n--)
      doc.push(lines[below(lines.length)]!);
    docs.push(doc.join("\n") + (below(2) === 0 ? "\n" : ""));
  }
  return docs;
}

/** Lines a container can take lazily, that the top level reads as a list once a setext underline follows. */
const LAZY_LIST_LINES = ["2) b", "2. b"];

interface Cut {
  part: string;
  next: string;
  /** The part alone, as the reader takes it, against the same lines of the whole note. */
  readsTheSame: boolean;
  /** The part ends on a definition with no title, the reason the reader cannot see from a decline. */
  endsOnBareDefinition: boolean;
  signal: boolean | undefined;
}

/** The text the package hands its reader: no byte order mark, and `\n` for every line ending. */
const readerText = (raw: string): string =>
  raw.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");

/** Every cut of `doc` at a top-level block boundary, the part being everything above it. */
function cuts(doc: string): Cut[] {
  const { tree, offsets } = parse8WithOffsets(doc, FEATURES);
  const blocks = tree.children ?? [];
  return blocks.slice(1).map((block, index) => {
    const at = block.position.start.offset;
    const part = doc.slice(0, at);
    const alone = parse8WithOffsets(part, FEATURES);
    const above = (table: Record<number, number>) =>
      JSON.stringify(
        Object.entries(table).filter(
          ([line]) => Number(line) < block.position.start.line,
        ),
      );
    const last = alone.tree.children?.at(-1);
    return {
      part,
      next: doc.slice(at),
      readsTheSame:
        JSON.stringify(alone.tree.children ?? []) ===
          JSON.stringify(blocks.slice(0, index + 1)) &&
        above(alone.offsets) === above(offsets),
      endsOnBareDefinition: last?.type === "definition" && last.title == null,
      signal: signal(part),
    };
  });
}

interface Sweep {
  total: number;
  signalled: number;
  differ: number;
  /** Cuts that read differently where the signal said it was safe. Must stay empty. */
  misread: Cut[];
  /** Cuts that read differently and only the bare-definition case caught. */
  caughtByBareDefinition: number;
}

function sweep(docs: string[]): Sweep {
  const result: Sweep = {
    total: 0,
    signalled: 0,
    differ: 0,
    misread: [],
    caughtByBareDefinition: 0,
  };
  for (const raw of docs) {
    for (const cut of cuts(readerText(raw))) {
      result.total++;
      if (cut.signal === true) result.signalled++;
      if (cut.readsTheSame) continue;
      result.differ++;
      if (cut.signal !== true) result.misread.push(cut);
      else if (cut.endsOnBareDefinition) result.caughtByBareDefinition++;
    }
  }
  return result;
}

const FRONTMATTER = /^---\n(?:[^\n]*\n)*?---/u;

interface Protocol {
  asked: number;
  /** Cuts the signal alone refused, where the reading would have been wrong. */
  saved: number;
  taken: number;
  misread: { part: string; next: string }[];
}

/**
 * What a caller can actually do, not knowing the whole note: take a line, with the next line
 * attached, and end the part there if that next line starts a top-level block and the signal is
 * false. Each such decision is then held to the whole note. Frontmatter is the caller's to find
 * first (the option's comment says so, and the fast path this exists for does).
 */
function protocol(docs: string[]): Protocol {
  const result: Protocol = { asked: 0, saved: 0, taken: 0, misread: [] };
  const asked = { ...FEATURES, readsPastEnd: true };
  for (const raw of docs) {
    const doc = readerText(raw);
    const whole = parse8WithOffsets(doc, FEATURES);
    const blocks = whole.tree.children ?? [];
    const closer = FRONTMATTER.exec(doc)?.[0].length ?? 0;
    for (
      let at = doc.indexOf("\n") + 1;
      at > 0;
      at = doc.indexOf("\n", at) + 1
    ) {
      if (at >= doc.length) break;
      if (at <= closer) continue;
      const lineEnd = doc.indexOf("\n", at);
      const text = lineEnd === -1 ? doc : doc.slice(0, lineEnd + 1);
      const part = parse8WithOffsets(text, asked);
      const own = part.tree.children ?? [];
      const next = own.findIndex((b) => b.position.start.offset === at);
      if (next <= 0) continue;
      result.asked++;
      const line = own[next]!.position.start.line;
      const above = (table: Record<number, number>) =>
        JSON.stringify(Object.entries(table).filter(([l]) => Number(l) < line));
      const same =
        JSON.stringify(own.slice(0, next)) ===
          JSON.stringify(blocks.filter((b) => b.position.start.offset < at)) &&
        above(part.offsets) === above(whole.offsets) &&
        blocks.some((b) => b.position.start.offset === at);
      if (part.readsPastEnd) {
        if (!same) result.saved++;
        continue;
      }
      result.taken++;
      if (!same) result.misread.push({ part: text, next: doc.slice(lineEnd) });
    }
  }
  return result;
}

describe("readsPastEnd", () => {
  it.each<[string, string]>([
    ["[", "a label left open"],
    ["[a", "a label left open"],
    ["[a\n", "a label left open, which a later line can close"],
    ["[\\", "a backslash at the end of a label"],
    ["   [a", "up to three columns of indent"],
    ["[a]:", "no destination yet"],
    ["[a]:\n\n", "a destination may come after blank lines"],
    ["[a]: <x", "an open angle destination"],
    ["[a]: <x\ny", "an open angle destination over lines"],
    ['[a]: x "t', "an open title"],
    ["[a]: x 't", "an open title"],
    ["[a]: x (t", "an open title"],
    ['[a]: x "t\n', "an open title that a later line can close"],
    ['[a]: x\n\n"t\nu', "an open title after a blank line"],
    ["[foo]: /url\n\n'tit [^1]", "the finding's first half"],
    ["[a\n\nb\n\nc", "a paragraph that is not the last"],
    ["[a|b\n-|-\n", "a table, the other block the reader declines to"],
    ["[^1]: d\n[\n", "a footnote definition asks the reader at each line"],
    [
      '[^1]: d\n[a]: x "t\n',
      "a footnote definition asks the reader at each line",
    ],
    ["[a]: x", "a bare definition, which a later line can undo"],
    ["[foo]: /url\n\n", "a bare definition before the blank lines"],
    ["[a]: <x>\n", "a bare definition in angle brackets"],
    ["b\n\n[a]: x\n", "a bare definition that ends the text"],
    ["\uFEFF[a", "after a byte order mark"],
    ['[a]: x "t\r\n', "over a Windows line break"],
  ])("is true for %j: %s", (source) => {
    expect(signal(source)).toBe(true);
  });

  it.each<[string, string]>([
    ['[a]: x "t"', "a complete definition"],
    ['[a]: x "t"\n\n', "a complete definition, then blank lines"],
    ['[a]: x "t"\r\n', "a complete definition over a Windows line break"],
    ["[a]: <x> 't'\n", "a complete definition in angle brackets"],
    ["[foo]: /url\n\n'tit [^1]\nle'", "the finding's second half"],
    ["[a]: x\n\nb\n", "a bare definition with text below it"],
    ['[a]: x "t\n\nb\n', "a blank line has ended the title for good"],
    ['[a]: x "t\n"', "a closer straight after a line ending ends it too"],
    ['[a]: x "t" z\n', "text after a closed title"],
    ["[a]: x y\n", "text after a destination"],
    ["[a]: <x[", "a bracket in an angle destination"],
    ["[a]\n", "a label with no colon"],
    ["[]: x\n", "an empty label"],
    ["", "nothing"],
    ["text", "no definition start"],
    ["text [a", "a bracket that does not start the block"],
    ["[^1", "a footnote's label"],
    ["[^1]: x", "a footnote definition"],
    ["[^1]: [a", "a footnote definition's body ends itself"],
    ["[^1]: d\n    [a", "a footnote definition's indented line ends itself"],
    ["> [a", "a quote ends itself"],
    ["- [a", "a list item ends itself"],
    ["    [a", "indented code"],
    ["# [a", "a heading"],
    ["```\n[a\n```\n", "a fence"],
    ["%%\n[a\n%%\n", "a comment"],
  ])("is false for %j: %s", (source) => {
    expect(signal(source)).toBe(false);
  });

  it("reads the finding's pair as it says, and nothing about the reading moves", () => {
    const first = parse("[foo]: /url\n\n'tit [^1]");
    expect(first.children.map((n) => n.type)).toEqual([
      "paragraph",
      "paragraph",
    ]);
    const second = parse("[foo]: /url\n\n'tit [^1]\nle'");
    expect(second.children).toMatchObject([
      { type: "definition", title: "tit [^1]\nle" },
    ]);
  });

  it("appears only when asked for, under legacy only", () => {
    expect(parse("[a")).toMatchObject({ data: { lineOffsets: {} } });
    expect(parse("[a").data).not.toHaveProperty("readsPastEnd");
    expect(parse("[a", { readsPastEnd: false }).data).not.toHaveProperty(
      "readsPastEnd",
    );
    expect(parse("[a", { readsPastEnd: true }).data).toEqual({
      lineOffsets: {},
      readsPastEnd: true,
    });
    expect(
      parse("[a", { readsPastEnd: true, lineOffsets: false }).data,
    ).toEqual({ readsPastEnd: true });
    expect(parse("[a", { lineOffsets: false })).not.toHaveProperty("data");
    const strict = unified()
      .use(remarkParse)
      .use(remarkObsidian, { preset: "strict", readsPastEnd: true });
    expect(strict.runSync(strict.parse("[a"), "[a").data).not.toHaveProperty(
      "readsPastEnd",
    );
  });

  it("answers the same without the reader's speed-ups", () => {
    const asked = { ...FEATURES, readsPastEnd: true };
    const differ = everyThird(corpus())
      .map(readerText)
      .filter(
        (doc) =>
          JSON.stringify(parse8WithOffsets(doc, asked, true)) !==
          JSON.stringify(parse8WithOffsets(doc, asked, false)),
      );
    expect(differ).toEqual([]);
  }, 120_000);

  it("leaves the tree byte-identical on every corpus document", () => {
    const docs = corpus();
    expect(docs.length).toBeGreaterThan(10_000);
    const differ = docs.filter((doc) => {
      const asked = parse(doc, { readsPastEnd: true });
      expect(typeof asked.data?.readsPastEnd).toBe("boolean");
      delete asked.data!.readsPastEnd;
      return JSON.stringify(asked) !== JSON.stringify(parse(doc));
    });
    expect(differ).toEqual([]);
  }, 120_000);

  describe("a part cut at a block boundary", () => {
    it("reads differently on the finding's shape, which only the signal can tell", () => {
      const [cut] = cuts("[foo]: /url\n\n'tit [^1]\n\nrest\n");
      expect(types(cut!.part)).toEqual(["definition"]);
      expect(types("[foo]: /url\n\n'tit [^1]\n\nrest\n")[0]).toBe("paragraph");
      expect(cut!.readsTheSame).toBe(false);
      expect(cut!.signal).toBe(true);
    });

    it("reads as the whole note does over the corpus while the signal is false", () => {
      const result = sweep(corpus());
      expect(result.misread).toEqual([]);
      expect(result.total).toBeGreaterThan(15_000);
      expect(result.signalled).toBeGreaterThan(0);
    }, 300_000);

    it("reads as the whole note does over generated documents while the signal is false", () => {
      const result = sweep(generated(8_000));
      expect(result.misread).toEqual([]);
      expect(result.total).toBeGreaterThan(8_000);
      // The known-positive control: the generator reaches the hazard, and the case the reader
      // cannot see from a decline is what catches it.
      expect(result.differ).toBeGreaterThan(0);
      expect(result.caughtByBareDefinition).toBe(result.differ);
    }, 300_000);

    it("reads the same through the public tree where the labels agree", () => {
      const labels = (tree: Root): string =>
        JSON.stringify(
          [...collectLabels(tree)].sort((a, b) => a.localeCompare(b)),
        );
      let compared = 0;
      const differ: string[] = [];
      for (const raw of everyThird(corpus())) {
        const doc = readerText(raw);
        const whole = parse(doc);
        const { tree } = parse8WithOffsets(doc, FEATURES);
        for (const block of (tree.children ?? []).slice(1)) {
          const at = block.position.start.offset;
          const part = doc.slice(0, at);
          const alone = parse(part, { readsPastEnd: true });
          if (alone.data?.readsPastEnd) continue;
          // Which labels a part can see is the caller's, and decides its references.
          if (labels(alone) !== labels(whole)) continue;
          compared++;
          const above = whole.children.filter(
            (node) => node.position!.start.offset! < at,
          );
          if (JSON.stringify(alone.children) !== JSON.stringify(above)) {
            differ.push(part);
          }
        }
      }
      expect(differ).toEqual([]);
      expect(compared).toBeGreaterThan(1_000);
    }, 300_000);

    it.each([
      [
        "> q\n2) b\n---\nrest\n",
        "> q\n2) b\n",
        "> q\n2) b\n---\n",
        "blockquote",
      ],
      [
        "> q\n2. b\n===\nrest\n",
        "> q\n2. b\n",
        "> q\n2. b\n===\n",
        "blockquote",
      ],
      [
        "[^1]: d\n2) b\n---\nrest\n",
        "[^1]: d\n2) b\n",
        "[^1]: d\n2) b\n---\n",
        "footnoteDefinition",
      ],
    ])(
      "without its next line, %j can differ with the signal false, which its next line settles",
      (whole, alone, withNext, container) => {
        // A container's lazy line followed by a setext underline is decided by that underline,
        // and the top level then reads the lazy line as a list. Known and left to the caller,
        // who always has the next line.
        expect(parse(alone, { readsPastEnd: true }).data?.readsPastEnd).toBe(
          false,
        );
        expect(types(alone)).toEqual([container]);
        expect(types(whole).slice(0, 2)).toEqual([container, "list"]);
        expect(types(withNext).slice(0, 2)).toEqual([container, "list"]);
      },
    );

    it("never misreads when the caller decides from the part and the next line alone", () => {
      const generatedRun = protocol(generated(5_000, LAZY_LIST_LINES));
      const corpusRun = protocol(everyThird(corpus()));
      expect(generatedRun.misread).toEqual([]);
      expect(corpusRun.misread).toEqual([]);
      expect(generatedRun.taken).toBeGreaterThan(4_000);
      expect(corpusRun.taken).toBeGreaterThan(3_000);
      // The known-positive control: without the signal these cuts are wrong.
      expect(generatedRun.saved).toBeGreaterThan(0);
      expect(corpusRun.saved).toBeGreaterThan(0);
    }, 300_000);

    it("is true only where a later line changes the reading", () => {
      const endings = ["\n]: x", "x", ">", '"', "'", ")", 'x"', "x'", "x)"];
      const blocksOf = (md: string) => parse8WithOffsets(md, FEATURES).tree;
      const startsOf = (md: string, type: string) =>
        new Set(
          (blocksOf(md).children ?? [])
            .filter((block) => block.type === type)
            .map((block) => block.position.start.offset),
        );
      const idle: string[] = [];
      let asked = 0;
      for (const doc of generated(1_500)) {
        for (const { part, signal: said } of cuts(doc)) {
          if (said !== true) continue;
          asked++;
          const before = startsOf(part, "definition");
          const taken = endings.some((more) =>
            (blocksOf(part + more).children ?? []).some(
              (block) =>
                block.type === "definition" &&
                !before.has(block.position.start.offset),
            ),
          );
          const undone = [...before].some(
            (start) => !startsOf(`${part}'t\n\nz\n`, "definition").has(start),
          );
          if (!taken && !undone) idle.push(part);
        }
      }
      expect(asked).toBeGreaterThan(500);
      expect(idle).toEqual([]);
    }, 300_000);
  });
});
