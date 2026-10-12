import fs from "node:fs";
import path from "node:path";

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
  // 46 + 46. One cause: a `%%` folded back into a definition's paragraph arrives as a
  // `break` plus a `text` whose spans run past the paragraph's own end, because the fold
  // extends the children and not the host. `[^1]: one` / `%%` / blank / `use[^1]` has
  // `paragraph[6..9]` holding children out to 12.
  "child ENDS AFTER parent: paragraph > break": 46,
  "child ENDS AFTER parent: paragraph > text": 46,
  // A callout's title is split out of the paragraph that held it, and the paragraph keeps
  // its original start -- `> [!note] Title` / `> [[target]]` gives `calloutTitle[10..15]`
  // beside `paragraph[2..28]`, so the two overlap by the title's whole width.
  "SIBLINGS OVERLAP: callout > calloutTitle/paragraph": 26,
  // NOT OURS. Bare `remark-parse` + `remark-gfm` produce this for `[ref]: /url` / `para` /
  // `===`: the heading's start is the definition's start, so the definition is contained in
  // its own following sibling. Filed in `UPSTREAM.md` as item 2, and reproducing it is the
  // reason this group must not be driven to zero by changing our own output.
  "SIBLINGS OVERLAP: root > definition/heading": 10,
  // A display-math block inside a list item ends after the next item begins:
  // `1. Hello $$` / `   Math` / `   $$` / `2.` gives `listItem[0..28]` beside
  // `listItem[26..28]`.
  "SIBLINGS OVERLAP: list > listItem/listItem": 6,
  "child ENDS AFTER parent: paragraph > footnoteReference": 4,
  "child ENDS AFTER parent: paragraph > wikilink": 2,
  "child ENDS AFTER parent: footnoteDefinition > break": 2,
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

describe("tree invariants", () => {
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
