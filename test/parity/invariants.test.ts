import fs from "node:fs";
import path from "node:path";

import { assert } from "mdast-util-assert";
import { describe, expect, it } from "vitest";

import { parseOurs, PROFILES } from "./chain.js";
import type { GoldenCase } from "./types.js";

/**
 * Structural invariants on the tree, which no other gate here checks.
 *
 * The parity gate compares projections, `compute` compares positions against Obsidian's
 * index, `points` checks that offsets agree with lines and columns, and `roundtrip` checks
 * that serialising converges. All four can pass on a tree that is internally inconsistent --
 * a child reaching past its parent, two siblings overlapping, a span running off the end of
 * the source. ~70 repair passes here write spans by hand, which is exactly where those break.
 *
 * It matters beyond tidiness because of who consumes this. `obsidian-linter` splices by
 * offset: given two overlapping siblings it cannot order its edits, and given a child
 * reaching past its parent it can delete text that belongs to neither. A wrong offset is
 * worse than a missing one, which is the rule this repo already applies to its own passes.
 *
 * A CEILING rather than zero, for the same reason `compute` holds one: the violations are
 * real and pre-existing, and a gate that is red from the first commit gets ignored. Every
 * group carries its attribution.
 */
const CEILING = {
  // CLOSED, all FOUR `child ENDS AFTER parent` groups at once -- 98 violations, where only
  // 92 were attributed. `commentInDefinitionTransform` folds a comment's lines back into a
  // paragraph and extended the DEFINITION's end for each block it absorbed while leaving the
  // paragraph where it was, so `[^1]: one` / `%%` / blank / `use[^1]` had `paragraph[6..9]`
  // holding children out to 12. Syncing the host's end to its last child closed the `break`
  // and `text` groups as expected, and the `footnoteReference` (4) and `wikilink` (2) groups
  // with them -- they were the same fold seen through a different child type, which the
  // per-child-type grouping had made look like separate families.
  // A callout's title is split out of the paragraph that held it, and the paragraph keeps
  // its original start -- `> [!note] Title` / `> [[target]]` gives `calloutTitle[10..15]`
  // beside `paragraph[2..28]`, so the two overlap by the title's whole width.
  "SIBLINGS OVERLAP: callout > calloutTitle/paragraph": 26,
  // NOT OURS. Bare `remark-parse` + `remark-gfm` produce this for `[ref]: /url` / `para` /
  // `===`: the heading's start is the definition's start, so the definition is contained in
  // its own following sibling. Filed in `UPSTREAM.md` as item 2, and reproducing it is the
  // reason this group must not be driven to zero by changing our own output.
  "SIBLINGS OVERLAP: root > definition/heading": 10,
  // CLOSED by `listItemExtentTransform`. It was `remark-math` extending an item past its
  // sibling's start when a `$$` opener shares its line with content, reproduced on bare
  // `remark-parse` + `remark-math@6.0.0` and filed in `UPSTREAM.md`. Repaired rather than
  // only reported, unlike the `definition`/`heading` entry below, because this one is in the
  // tree this package SHIPS.
  // CLOSED. It arrived as `footnoteDefinition > break`, became `> paragraph` when the
  // demoted math was wrapped, and went when the wrapper stopped inheriting the math node's
  // trailing line ending: a `math` span runs through the ending after its block, which is
  // right for a flow node and wrong for the phrasing node replacing it.
} as const;

interface Point {
  readonly line: number;
  readonly column: number;
  readonly offset?: number;
}

interface Spanned {
  readonly type?: string;
  readonly position?: { readonly start: Point; readonly end: Point };
  readonly children?: readonly unknown[];
}

function violationsOf(markdown: string, tree: unknown): string[] {
  const found: string[] = [];
  const walk = (node: unknown, parent: Spanned | null): void => {
    const self = node as Spanned;
    const mine = self.position;
    const theirs = parent?.position;
    if (mine?.start.offset !== undefined && mine.end.offset !== undefined) {
      if (mine.start.offset > mine.end.offset) {
        found.push(`start AFTER end: ${self.type}`);
      }
      if (mine.end.offset > markdown.length) {
        found.push(`end PAST source: ${self.type}`);
      }
      if (
        theirs?.start.offset !== undefined &&
        theirs.end.offset !== undefined
      ) {
        if (mine.start.offset < theirs.start.offset) {
          found.push(
            `child STARTS BEFORE parent: ${parent?.type} > ${self.type}`,
          );
        }
        if (mine.end.offset > theirs.end.offset) {
          found.push(`child ENDS AFTER parent: ${parent?.type} > ${self.type}`);
        }
      }
    }
    const kids = (self.children ?? []) as Spanned[];
    for (const [index, left] of kids.entries()) {
      const right = kids[index + 1];
      if (!right) break;
      const leftEnd = left.position?.end?.offset;
      const rightStart = right.position?.start?.offset;
      if (
        leftEnd !== undefined &&
        rightStart !== undefined &&
        leftEnd > rightStart
      ) {
        found.push(
          `SIBLINGS OVERLAP: ${self.type} > ${left.type}/${right.type}`,
        );
      }
    }
    for (const kid of kids) walk(kid, self);
  };
  walk(tree, null);
  return found;
}

const goldens = path.join(import.meta.dirname, "goldens/obsidian.json");
const golden = JSON.parse(fs.readFileSync(goldens, "utf8")) as {
  cases: Record<string, GoldenCase>;
};
const profiles = Object.keys(PROFILES) as Array<keyof typeof PROFILES>;

/**
 * mdast's content model, which `mdast-util-assert` does not check.
 *
 * Upstream's assertion library was the obvious tool and it validates node SHAPE only --
 * a missing `type`, a non-array `children`, a literal carrying children. Verified against
 * controls rather than assumed: it ACCEPTS a `listItem` at the root, a `tableCell` under
 * root, a `paragraph` nested in a `paragraph`, a `list` holding a paragraph, and a node whose
 * type is `nonsense`. It is kept as a cheap shape gate, at 0 violations, because every pass
 * here that builds a node by hand could break that; it is not a containment check.
 *
 * So this is the containment check. The content model it encodes is CommonMark's two classes
 * plus this package's own nodes, and an unmodelled type is reported rather than ignored --
 * a silent pass for a node nobody listed is how a table like this rots.
 */
const PHRASING = new Set([
  "text",
  "emphasis",
  "strong",
  "delete",
  "inlineCode",
  "break",
  "link",
  "image",
  "linkReference",
  "imageReference",
  "footnoteReference",
  "html",
  "inlineMath",
  "wikilink",
  "tag",
  "highlight",
  "comment",
  "footnote",
  "blockId",
]);
const FLOW = new Set([
  "paragraph",
  "heading",
  "thematicBreak",
  "blockquote",
  "list",
  "table",
  "html",
  "code",
  "definition",
  "footnoteDefinition",
  "math",
  "yaml",
  "toml",
  "callout",
  "comment",
  "blockId",
]);
const CONTENT_MODEL: Record<string, Set<string> | "none"> = {
  root: FLOW,
  paragraph: PHRASING,
  heading: PHRASING,
  tableCell: PHRASING,
  emphasis: PHRASING,
  strong: PHRASING,
  delete: PHRASING,
  link: PHRASING,
  linkReference: PHRASING,
  highlight: PHRASING,
  calloutTitle: PHRASING,
  footnote: PHRASING,
  wikilink: PHRASING,
  tag: PHRASING,
  list: new Set(["listItem"]),
  table: new Set(["tableRow"]),
  tableRow: new Set(["tableCell"]),
  listItem: FLOW,
  blockquote: FLOW,
  footnoteDefinition: FLOW,
  callout: new Set([...FLOW, "calloutTitle"]),
  comment: new Set([...FLOW, ...PHRASING]),
  image: "none",
  text: "none",
  inlineCode: "none",
  code: "none",
  break: "none",
  thematicBreak: "none",
  yaml: "none",
  inlineMath: "none",
  definition: "none",
  imageReference: "none",
  math: "none",
  html: "none",
  blockId: "none",
  footnoteReference: "none",
};

/**
 * ZERO, and an absolute assertion rather than a ceiling.
 *
 * It opened at 24 violations across six shapes, all ONE defect:
 * `mathUnclosedContainerTransform` replaced a flow `math` node with a phrasing `text` node
 * directly inside a block container that requires flow content. Wrapping the text in a
 * paragraph closed all 24, and the `break` half went with it -- `remark-breaks` splits a text
 * value's line endings in place, so an unwrapped value had put its `break` nodes in the
 * container too.
 *
 * Absolute because the content model is not debt. A node in an illegal position is a defect
 * under any reading, unlike a span that merely disagrees with Obsidian, and there is no
 * argument for carrying one.
 */
const CONTAINMENT_CEILING = {} as const;

function containmentOf(tree: unknown): string[] {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    const self = node as { type?: string; children?: unknown[] };
    const kids = (self.children ?? []) as Array<{ type?: string }>;
    const rule = CONTENT_MODEL[self.type ?? ""];
    if (rule === "none") {
      if (kids.length > 0) found.push(`${self.type} should have NO children`);
    } else if (rule) {
      for (const kid of kids) {
        if (!rule.has(kid.type ?? "")) found.push(`${self.type} > ${kid.type}`);
      }
    } else if (self.type) {
      found.push(`UNMODELLED: ${self.type}`);
    }
    for (const kid of kids) walk(kid);
  };
  walk(tree);
  return found;
}

describe("tree invariants", () => {
  it("builds every node to mdast's shape", () => {
    const offenders: string[] = [];
    for (const [id, entry] of Object.entries(golden.cases)) {
      for (const profile of profiles) {
        let tree: unknown;
        try {
          tree = parseOurs(entry.markdown, profile);
        } catch {
          continue;
        }
        try {
          assert(tree);
        } catch (error) {
          offenders.push(`${id} [${profile}]: ${String(error).slice(0, 70)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("breaks mdast's content model no more than the recorded ceiling", () => {
    const counts: Record<string, number> = {};
    for (const entry of Object.values(golden.cases)) {
      for (const profile of profiles) {
        let tree: unknown;
        try {
          tree = parseOurs(entry.markdown, profile);
        } catch {
          continue;
        }
        for (const kind of containmentOf(tree)) {
          counts[kind] = (counts[kind] ?? 0) + 1;
        }
      }
    }
    expect(counts).toEqual(CONTAINMENT_CEILING);
  });

  it("violates no more structural invariants than the recorded ceiling", () => {
    const counts: Record<string, number> = {};
    for (const entry of Object.values(golden.cases)) {
      for (const profile of profiles) {
        let tree: unknown;
        try {
          tree = parseOurs(entry.markdown, profile);
        } catch {
          continue;
        }
        for (const kind of violationsOf(entry.markdown, tree)) {
          counts[kind] = (counts[kind] ?? 0) + 1;
        }
      }
    }
    expect(counts).toEqual(CEILING);
  });

  it("never places a child outside the source", () => {
    const offenders: string[] = [];
    for (const [id, entry] of Object.entries(golden.cases)) {
      for (const profile of profiles) {
        let tree: unknown;
        try {
          tree = parseOurs(entry.markdown, profile);
        } catch {
          continue;
        }
        const bad = violationsOf(entry.markdown, tree).filter(
          (kind) =>
            kind.startsWith("end PAST source") ||
            kind.startsWith("start AFTER end"),
        );
        if (bad.length > 0) offenders.push(`${id} [${profile}] ${bad[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
