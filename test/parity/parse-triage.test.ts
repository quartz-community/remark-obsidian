import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { compareCase } from "./compare.js";
import type { GoldenCase } from "./types.js";

/**
 * Parse rules found by reading another Obsidian parser's oracle corpus, kept as our own
 * recordings (Obsidian 1.15.0).
 *
 * `mnaoumov/obsidian-markdown-parser` records about 5,000 documents against the live app. Its
 * licence reserves every right, so none of its documents are here: 4,183 of them that this
 * package's goldens and referee do not hold were recorded through this harness, and the
 * families they missed on were reduced to these minimal probes, written and recorded here, each
 * beside controls:
 *
 * - a table indented one to three spaces before its first `|` is pipeless to Obsidian, so that
 *   `|` ends an empty first cell (legacy);
 * - a wikilink target loses the backslash before `]]` and then its trailing whitespace:
 *   `[[a \]]` links to `a` (both presets);
 * - a tag straight after a highlight's colour marker forms: `==🔴#t==` (both presets);
 * - a bare `$$` on its container's last line is text: `> $$`, `- $$` (strict; legacy already);
 * - frontmatter ends at its closing `---`, not past trailing whitespace (strict; legacy already).
 *
 * Under `strict`, GFM reads the indented tables, by the spec.
 */
const golden = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "goldens/parse-triage.json"),
    "utf8",
  ),
) as { mathTex: boolean; cases: Record<string, GoldenCase> };

/** Tables GFM reads, which `strict` follows: the indent before a `|` is no cell there. */
const STRICT_BY_SPEC = [
  "parse-triage/table/a0",
  "parse-triage/table/a1",
  "parse-triage/table/a2",
  "parse-triage/table/a3",
  "parse-triage/table/a4",
  "parse-triage/table/a5",
  "parse-triage/table/a6",
  "parse-triage/table/a7",
  "parse-triage/table/a8",
  "parse-triage/table/b0",
  "parse-triage/table/b1",
  "parse-triage/table/b3",
  "parse-triage/table/b4",
  "parse-triage/table/b5",
  "parse-triage/table/b6",
];

const missed = (preset: "legacy" | "strict"): string[] => {
  process.env.PARITY_PRESET = preset;
  return Object.values(golden.cases)
    .filter((recorded) => !compareCase(recorded, golden.mathTex).matched)
    .map((recorded) => recorded.id);
};

describe("parse triage", () => {
  afterEach(() => {
    delete process.env.PARITY_PRESET;
  });

  it("records every case", () => {
    expect(Object.keys(golden.cases)).toHaveLength(74);
  });

  it("matches every recorded document under legacy", () => {
    expect(missed("legacy")).toEqual([]);
  });

  it("matches every recorded document under strict but GFM's tables", () => {
    expect(missed("strict")).toEqual(STRICT_BY_SPEC);
  });
});
