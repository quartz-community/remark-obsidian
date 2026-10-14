import { describe, expect, it } from "vitest";

import { contradictions } from "./fuzz/contradictions.js";

/**
 * The contradiction detector, as a gate rather than a habit.
 *
 * A shape holding both a `match` case and a `replicate` one is two recorded documents that
 * cannot both follow from the same rule, so one of them is evidence that a rule here is wrong
 * and the pair says where. `README.md` calls it "the only selector in this harness that has not
 * gone blunt" and says to re-run it after every landing -- and nothing did: a grep for
 * `contradictions` across `test/`, `package.json` and `.github/` found the script and a single
 * README mention.
 *
 * It reports ZERO today, which is exactly when a detector is worth gating: the cost is one
 * assertion and the thing it prevents is a contradiction appearing and nobody noticing for
 * however long it takes someone to remember a script. Every landing re-partitions the triage,
 * which is what makes this re-measurable at all rather than a one-off audit.
 *
 * EMPTY, not a count. A count cannot tell a new contradiction from one traded for another --
 * the lesson `compute.test.ts` now holds as identities and `roundtrip.test.ts` as emptiness.
 */
describe("recorded contradictions", () => {
  it("has no shape holding both a matching and a diverging case", () => {
    expect(
      contradictions().map(
        ([shape, sides]) =>
          `${JSON.stringify(shape.slice(0, 44))}  ${sides.replicate.length} diverging / ${sides.match.length} matching`,
      ),
    ).toEqual([]);
  });
});
