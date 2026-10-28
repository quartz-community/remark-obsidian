import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { compareCase } from "./compare.js";
import type { GoldenCase } from "./types.js";

/**
 * The differential fuzz's triage, kept as recordings.
 *
 * Two rounds of the nightly sweep reduced 39 failing seeds to minimal forms, and live probes
 * settled the rules behind three of their groups (Obsidian 1.15.0):
 *   - an identifier ending any text inside a wrapper or a table cell renders stripped;
 *   - footnote bodies render after the text, inline notes first, then definitions in reference
 *     order;
 *   - the line ending after display math is dropped unless only indentation precedes the `$$`.
 * 40 of the 69 recorded documents here diverged before the projection learned those rules (the
 * rest are controls recorded beside them), and every one matches now. Left out: six
 * self-embeds (out of scope, as `fuzz/sweep.ts` skips them) and `[^1]: - [ ] [` / `^[[^1]]]`,
 * where Obsidian's renderer reads a reference its own `metadataCache` does not.
 */
const golden = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "goldens/projection-triage.json"),
    "utf8",
  ),
) as { cases: Record<string, GoldenCase> };

describe("projection triage", () => {
  it("records every case", () => {
    expect(Object.keys(golden.cases)).toHaveLength(69);
  });

  it("matches every recorded document", () => {
    const wrong = Object.values(golden.cases).flatMap((golden) => {
      const result = compareCase(golden, false);
      return result.matched
        ? []
        : [`${golden.id} ${JSON.stringify(result.divergences).slice(0, 200)}`];
    });
    expect(wrong).toEqual([]);
  });
});
