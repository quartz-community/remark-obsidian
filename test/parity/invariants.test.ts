import fs from "node:fs";
import path from "node:path";

import { assert } from "mdast-util-assert";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";

import { containmentOf, violationsOf } from "./invariant-checks.js";

import remarkObsidian from "../../src/index.js";
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
  // CLOSED. The body paragraph kept the start it had before the title was lifted out of it,
  // which is the `>` marker's content column, so `> [!note] Title` / `> [[target]]` left
  // `paragraph[2..28]` beside `calloutTitle[10..15]` -- overlapping by the title's whole
  // width. Syncing the paragraph's start to its first remaining child closed all 26.
  // NOT OURS, and the ONLY entry left. Bare `remark-parse` + `remark-gfm` produce this for
  // `[ref]: /url` / `para` / `===`: the heading's start is the definition's start, so the
  // definition is contained in its own following sibling. Filed in `UPSTREAM.md` as item 2.
  //
  // The ceiling opened at 142 across 8 groups and is now this one group of 10, every other
  // violation closed in five fixes. It must NOT be driven to zero: doing so would mean
  // diverging from upstream's own output, which is a different kind of claim from fixing a
  // defect. Unlike item 5, nothing here reads these spans and we do not synthesise them --
  // they arrive from `remark-parse` and pass straight through.
  //
  // ZERO since 2.0, and that is not a divergence from upstream: `legacy` no longer parses with
  // `remark-parse` 11 at all. remark-parse 8, the parser Obsidian forks, starts the heading on
  // its own line, so the overlap -- a micromark property -- does not arise. `strict` still
  // passes micromark's spans through unchanged; this gate runs the legacy profiles.
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

const goldens = path.join(import.meta.dirname, "goldens/obsidian.json");
const golden = JSON.parse(fs.readFileSync(goldens, "utf8")) as {
  cases: Record<string, GoldenCase>;
};
const profiles = Object.keys(PROFILES) as Array<keyof typeof PROFILES>;

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

  /**
   * A formula renders from `data.hChildren`, which `mdast-util-math` builds at parse time;
   * `mdast-util-to-hast` never reads `value`. A pass that rewrote `value` alone left a tree that
   * looked right and HTML that showed the old formula: under `strict`, `1. Hello $$` / `   Math`
   * / `   $$` rendered an empty block. Three writers did it -- `mathMidlineTransform`,
   * `mathFenceTransform`, and the reading pass's placeholder restore -- in 86 strict documents
   * of the corpus, spec and referee, and none under `legacy`.
   *
   * Both presets, because every other gate here runs the `legacy` profiles and so never saw it.
   */
  it("renders the formula every math node holds, under both presets", () => {
    const hinted = (node: { data?: { hChildren?: unknown[] } }) => {
      const text = (hast: unknown): string => {
        const self = hast as {
          type?: string;
          value?: string;
          children?: unknown[];
        };
        return self.type === "text"
          ? (self.value ?? "")
          : (self.children ?? []).map(text).join("");
      };
      return node.data?.hChildren?.map(text).join("");
    };
    const offenders: string[] = [];
    let checked = 0;
    for (const preset of ["legacy", "strict"] as const) {
      const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkObsidian, {
          ...PROFILES["quartz-default"].remarkObsidian,
          preset,
        });
      for (const [id, entry] of Object.entries(golden.cases)) {
        const tree = processor.runSync(
          processor.parse(entry.markdown),
          entry.markdown,
        );
        visit(tree, (node) => {
          if (node.type !== "math" && node.type !== "inlineMath") return;
          checked++;
          const math = node as unknown as {
            value: string;
            data?: { hChildren?: unknown[] };
          };
          const hint = hinted(math);
          if (hint !== undefined && hint !== math.value) {
            offenders.push(
              `${id} [${preset}] ${node.type}: ${JSON.stringify(hint)}`,
            );
          }
        });
      }
    }
    expect(checked).toBeGreaterThan(400);
    expect(offenders).toEqual([]);
  });
});
