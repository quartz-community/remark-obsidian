/**
 * Structurally impossible positions, gated over sources the golden corpus does not hold.
 *
 * `invariants.test.ts` asserts this exact class is EMPTY — `expect(offenders).toEqual([])` over
 * `end PAST source` and `start AFTER end`. It iterates `golden.cases`, which is 3,448 documents.
 * The referee holds 6,818, and running the SAME checks over those for the first time found 33
 * violations on 8 documents, so the project asserted a property it could not back.
 *
 * This file closes that hole without depending on the referee corpus, which is not vendored.
 * `position-defects.ts` carries the 8 sources directly, so the defect is visible with no
 * Obsidian, no recording and no sibling checkout.
 *
 * NOT A PARITY CEILING. A node whose start is after its end is wrong whatever Obsidian reports,
 * and `legacy` promises exact positions because consumers index by them — `obsidian-linter`
 * splices by offset, so such a node corrupts an edit rather than misreporting one. Unlike
 * `compute.test.ts`'s ceilings, this list should reach zero.
 */
import { describe, expect, it } from "vitest";

import { violationsOf } from "./invariant-checks.js";
import { POSITION_DEFECTS } from "./position-defects.js";
import { refereeFactsWithTree } from "./referee-facts.js";

function point(offset: number): {
  line: number;
  column: number;
  offset: number;
} {
  return { line: 1, column: offset + 1, offset };
}

const ABSOLUTE = (kind: string): boolean =>
  kind.startsWith("end PAST source") || kind.startsWith("start AFTER end");

function absoluteViolations(markdown: string): string[] {
  const { tree } = refereeFactsWithTree(markdown);
  return [...new Set(violationsOf(markdown, tree))].filter(ABSOLUTE).sort();
}

describe("structurally impossible positions", () => {
  it("produces no impossible position on any recorded source", () => {
    const moved: string[] = [];
    for (const [id, markdown, kinds] of POSITION_DEFECTS) {
      const got = absoluteViolations(markdown);
      const want = [...kinds].sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        moved.push(
          `${id}\n    recorded: ${want.join(" | ")}\n    actual:   ${got.join(" | ") || "(none)"}`,
        );
      }
    }
    expect(
      moved,
      "a source regressed. These eight are the only inputs in CI that exercise either fix",
    ).toEqual([]);
  });

  it("keeps all eight sources, and expects zero violations from them", () => {
    // Opened at 8 documents / 20 violation kinds and is now 8 / 0. Both numbers are asserted so
    // that DELETING a source is a deliberate edit: these eight are the only inputs in CI that
    // reach either fix, since the referee corpus they came from is not vendored.
    expect(POSITION_DEFECTS.length).toBe(8);
    expect(
      POSITION_DEFECTS.reduce((total, [, , kinds]) => total + kinds.length, 0),
    ).toBe(0);
  });

  it("reports nothing for a document with sound positions", () => {
    // A KNOWN-NEGATIVE control. Without it, a check that silently stopped reaching would make
    // every entry above "fixed" at once and this file would read as a success.
    expect(
      absoluteViolations("a paragraph\n\n[^1]: a definition\n\nuse[^1]\n"),
    ).toEqual([]);
  });

  it("detects the class at all, on a tree built to carry it", () => {
    // A KNOWN-POSITIVE control, and the half that matters: every assertion above passes just as
    // happily when `violationsOf` has stopped reaching anything. It can no longer borrow a real
    // source, because all eight are clean -- so the inverted span is built by hand instead.
    const source = "abc\n";
    const inverted = {
      type: "root",
      position: { start: point(0), end: point(4) },
      children: [
        {
          type: "paragraph",
          position: { start: point(3), end: point(1) },
          children: [],
        },
      ],
    };
    const got = violationsOf(source, inverted).filter(ABSOLUTE);
    expect(got).toEqual(["start AFTER end: paragraph"]);
  });
});
