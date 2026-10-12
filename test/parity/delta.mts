/**
 * What a change just gained and what it just broke, before committing it.
 *
 *     npx tsx --conditions=development test/parity/delta.mts
 *
 * `npm test` answers "is the gate green", which is the wrong question while iterating: a
 * change that fixes nine cases and breaks one shows up as a single red suite with no sense
 * of the trade. This prints both sides -- `replicate` cases that now match, and `match` cases
 * that now diverge -- which is the shape every rule here is accepted or refused on.
 *
 * It is the cheapest gate in the repo and the one to run first. **Measure, do not estimate**
 * is the standing rule, and this is what makes measuring cost nothing: three refusals in
 * these notes were decided by a count from this script that an estimate had got backwards --
 * label precedence was declined three times on a predicted blast radius of 369 cases and
 * cost 0, while widening the same rule looked identical and cost 35.
 *
 * Note what it does NOT see, because two lessons here were paid for in exactly that gap. It
 * reads `compareCase`, so a divergence only the positioned oracle reports is invisible --
 * `compute.test.ts` is a separate gate and a clean delta has read as success while `blocks`
 * stayed wrong. And a clean delta against a corpus holding no case for the rule in question
 * says nothing at all; count the cases that exercise a rule before trusting a zero.
 */
import fs from "node:fs";
import path from "node:path";

import { compareCase } from "./compare.js";
import type { GoldenCase } from "./types.js";

const goldens = path.join(import.meta.dirname, "goldens/obsidian.json");
const golden = JSON.parse(fs.readFileSync(goldens, "utf8")) as {
  cases: Record<string, GoldenCase>;
  oracle?: { mathTex?: boolean };
};

const fixed: string[] = [];
const broken: string[] = [];
const crashed: string[] = [];

for (const [id, entry] of Object.entries(golden.cases)) {
  const result = compareCase(entry, golden.oracle?.mathTex ?? false);
  if (result.crash) crashed.push(`${id}: ${result.crash}`);
  if (entry.triage === "replicate" && result.matched) fixed.push(id);
  if (entry.triage === "match" && !result.matched) broken.push(id);
}

const list = (label: string, ids: readonly string[], mark: string) => {
  console.log(`${label} : ${ids.length}`);
  for (const id of ids.slice(0, 30)) console.log(`    ${mark} ${id}`);
  if (ids.length > 30) console.log(`    ... and ${ids.length - 30} more`);
};

list("replicate cases that now MATCH", fixed, "+");
console.log("");
list("match cases now BROKEN (regressions)", broken, "!");
if (crashed.length > 0) {
  console.log("");
  list("cases where our parser THREW", crashed, "x");
}
