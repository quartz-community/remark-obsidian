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

/**
 * `--dump <file>` / `--blast <file>`, the same four buckets `referee.mts` grew them for.
 *
 * THE GAP THIS CLOSES IS THIS SCRIPT'S OWN. The two lists below are keyed on the TRIAGE
 * state, so they answer "did a `replicate` case start matching" and "did a `match` case
 * stop". Neither can see a case that was diverging and still diverges while our answer
 * CHANGED -- the triage state is the same, `matched` is false either way, and the report is
 * silent. That is the bucket `referee.mts --blast` found 27 of over one session, and this
 * gate has strictly more surface: ~10 projections per case plus `meta.*` and `html.*`,
 * against the referee's two fields.
 *
 * It matters most for exactly the states this script deliberately ignores. A `replicate`
 * case is allowed to diverge, so nothing checks WHICH way it diverges, and a half-finished
 * rule can move one of them from one wrong answer to another indefinitely.
 */
const valueOf = (flag: string): string | undefined => {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
};
const dumpTo = valueOf("--dump");
const blastFrom = valueOf("--blast");

const fixed: string[] = [];
const broken: string[] = [];
const crashed: string[] = [];
const snapshot: Record<string, { matched: boolean; sig: string }> = {};
const baseline: Record<string, { matched: boolean; sig: string }> =
  blastFrom === undefined
    ? {}
    : (JSON.parse(fs.readFileSync(blastFrom, "utf8")) as typeof baseline);
const blast: Array<{
  id: string;
  triage: string;
  bucket: "gained" | "lost" | "still wrong";
  keys: string;
}> = [];

for (const [id, entry] of Object.entries(golden.cases)) {
  const result = compareCase(entry, golden.oracle?.mathTex ?? false);
  if (result.crash) crashed.push(`${id}: ${result.crash}`);
  if (entry.triage === "replicate" && result.matched) fixed.push(id);
  if (entry.triage === "match" && !result.matched) broken.push(id);

  if (dumpTo !== undefined || blastFrom !== undefined) {
    // OUR side only. The golden is fixed, so including Obsidian's values would make the
    // signature differ whenever the goldens are re-recorded rather than when we change.
    const sig = JSON.stringify(
      result.divergences.map((d) => [d.key, JSON.stringify(d.ours)]),
    );
    snapshot[id] = { matched: result.matched, sig };
    const was = baseline[id];
    if (
      was !== undefined &&
      (was.sig !== sig || was.matched !== result.matched)
    ) {
      blast.push({
        id,
        triage: entry.triage,
        bucket: result.matched
          ? "gained"
          : was.matched
            ? "lost"
            : "still wrong",
        keys: result.divergences.map((d) => d.key).join(","),
      });
    }
  }
}

if (dumpTo !== undefined) {
  fs.writeFileSync(dumpTo, JSON.stringify(snapshot));
  console.log(`dumped ${Object.keys(snapshot).length} cases to ${dumpTo}`);
  process.exit(0);
}

if (blastFrom !== undefined) {
  const buckets = new Map<string, number>();
  for (const row of blast) {
    buckets.set(row.bucket, (buckets.get(row.bucket) ?? 0) + 1);
  }
  console.log(`blast radius against ${blastFrom}`);
  console.log(
    `  answers ALTERED : ${blast.length} of ${Object.keys(golden.cases).length}`,
  );
  for (const bucket of ["gained", "lost", "still wrong"]) {
    console.log(`    ${bucket.padEnd(12)} ${buckets.get(bucket) ?? 0}`);
  }
  const silent = blast.filter((row) => row.bucket === "still wrong");
  if (silent.length > 0) {
    console.log(
      `\n  STILL WRONG -- our answer changed while the case kept diverging.`,
    );
    console.log(
      `  Neither list below can see these, which is why they are here.`,
    );
    const byTriage = new Map<string, number>();
    for (const row of silent) {
      byTriage.set(row.triage, (byTriage.get(row.triage) ?? 0) + 1);
    }
    for (const [triage, count] of [...byTriage].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(count).padStart(4)}  triage=${triage}`);
    }
    for (const row of silent.slice(0, 30)) {
      console.log(`    ${row.id}  [${row.triage}]  ${row.keys}`);
    }
    if (silent.length > 30) {
      console.log(`    ... and ${silent.length - 30} more`);
    }
  }
  process.exit(0);
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
