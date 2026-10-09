import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { GoldenCase } from "../types.js";

/**
 * Report shapes of recorded case that hold both a matching and a diverging case.
 *
 * Two cases that share a shape, where one matches Obsidian and one does not, cannot
 * both follow from the same rule -- so one of them is evidence that a rule here is
 * wrong, and the pair says where. That is the only selector in this harness that has
 * not gone blunt. All three counting heuristics tried have produced near-perfect
 * families: probes per open case, neighbour frequency, and construct frequency, the
 * last of which dies to a base rate (see the parity README).
 *
 *   npx tsx --conditions=development test/parity/fuzz/contradictions.ts
 *   TOP=24 npx tsx --conditions=development test/parity/fuzz/contradictions.ts
 *
 * Needs no Obsidian: it reads the committed goldens and their triage.
 *
 * The skeleton collapses runs of word characters to `w` and then collapses adjacent
 * `w`s across horizontal whitespace only, keeping punctuation and layout. So `[^1]: x` and `[^9]: yy` are one shape
 * while `[^1]:` and `[^1]: ` are two -- which is exactly the distinction the
 * bare-colon definition rule turned on, and why the collapse stops at punctuation.
 *
 * Found this way, among others: a `mailto:` prefix stripped in any case, a callout
 * title written empty versus absent, and legacy's ASCII-only word-boundary test for
 * `_`. Re-run it after every landing, because each one re-partitions the triage and
 * can expose a shape that was uniformly diverging a moment ago.
 */
const WORD_RUN = /[A-Za-z0-9\u00a0-\uffff]+/gu;
/**
 * Flat on purpose: `w(?:[ \t]*w)+` is a quantified group and the ReDoS lint refuses it.
 *
 * Horizontal whitespace only. `\s` matches a line ending, so the collapse used to run
 * across lines and merge documents with different layouts: `[foo]: /url` / `bar` / `===`
 * / `[foo]` skeletonised to the same shape as `[foo]: /url` / `===` / `[foo]`, and the
 * detector reported a contradiction between two cases that are not the same input at
 * all. They differ by exactly the intervening line, which is the whole rule -- a
 * definition directly under a setext underline becomes a heading and defines nothing,
 * while one with a line between it keeps its definition.
 *
 * That false positive stood for a week, which matters more than the one shape: a
 * contradiction is the only live selector left here, so a detector that invents them
 * spends attention on nothing and -- worse -- hides the real ones it merged away.
 */
const ADJACENT = /w[ \t]*w/gu;

function skeleton(markdown: string): string {
  let out = markdown.replace(WORD_RUN, "w");
  for (;;) {
    const next = out.replace(ADJACENT, "w");
    if (next === out) return out.trimEnd();
    out = next;
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenPath = path.join(here, "..", "goldens", "obsidian.json");
const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8")) as {
  cases: Record<string, GoldenCase>;
};

interface Shape {
  readonly match: string[];
  readonly replicate: string[];
}

const shapes = new Map<string, Shape>();
for (const [id, entry] of Object.entries(golden.cases)) {
  if (entry.triage !== "match" && entry.triage !== "replicate") continue;
  const key = skeleton(String(entry.markdown));
  const slot = shapes.get(key) ?? { match: [], replicate: [] };
  (entry.triage === "match" ? slot.match : slot.replicate).push(id);
  shapes.set(key, slot);
}

const mixed = [...shapes]
  .filter(([, v]) => v.match.length > 0 && v.replicate.length > 0)
  .sort((a, b) => b[1].replicate.length - a[1].replicate.length);

const source = (id: string): string =>
  JSON.stringify(String(golden.cases[id]?.markdown ?? "").slice(0, 32));

console.log(
  `  ${mixed.length} shapes hold both a matching and a diverging case`,
);
const top = Number(process.env["TOP"] ?? "14");
for (const [key, v] of mixed.slice(0, top)) {
  console.log(
    `\n  shape ${JSON.stringify(key.slice(0, 44))}  (${v.replicate.length} diverging, ${v.match.length} matching)`,
  );
  for (const id of v.replicate.slice(0, 3)) {
    console.log(`      DIVERGE ${id.padEnd(42)} ${source(id)}`);
  }
  for (const id of v.match.slice(0, 3)) {
    console.log(`      match   ${id.padEnd(42)} ${source(id)}`);
  }
}
