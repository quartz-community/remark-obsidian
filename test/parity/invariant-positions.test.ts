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

const ABSOLUTE = (kind: string): boolean =>
  kind.startsWith("end PAST source") || kind.startsWith("start AFTER end");

function absoluteViolations(markdown: string): string[] {
  const { tree } = refereeFactsWithTree(markdown);
  return [...new Set(violationsOf(markdown, tree))].filter(ABSOLUTE).sort();
}

describe("structurally impossible positions", () => {
  it("still produces exactly the recorded defects, and no others", () => {
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
      "a recorded defect changed. If it is FIXED, delete its entry from position-defects.ts",
    ).toEqual([]);
  });

  it("keeps the backlog size an explicit number", () => {
    // Asserted so that shrinking it is a deliberate edit here rather than something that
    // silently stops being measured. Opened at 8 documents / 20 kinds; 7 closed at once when
    // `definition-end-before-label.ts` stopped clamping a descendant whose start is past the
    // new reach. The remaining one is `end PAST source`, a different class.
    expect(POSITION_DEFECTS.length).toBe(1);
    expect(
      POSITION_DEFECTS.reduce((total, [, , kinds]) => total + kinds.length, 0),
    ).toBe(2);
  });

  it("reports nothing for a document with sound positions", () => {
    // A KNOWN-NEGATIVE control. Without it, a check that silently stopped reaching would make
    // every entry above "fixed" at once and this file would read as a success.
    expect(
      absoluteViolations("a paragraph\n\n[^1]: a definition\n\nuse[^1]\n"),
    ).toEqual([]);
  });

  it("detects the class at all, on a source known to carry it", () => {
    // A KNOWN-POSITIVE control, which is the half that matters: the negative above passes just
    // as happily when `violationsOf` returns nothing for every input.
    const [, markdown] = POSITION_DEFECTS[0]!;
    expect(absoluteViolations(markdown).length).toBeGreaterThan(0);
  });
});
