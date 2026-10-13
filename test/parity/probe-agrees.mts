/**
 * Does the in-process probe agree with the committed goldens?
 *
 *     npx tsx --conditions=development test/parity/probe-agrees.mts
 *
 * `ask-dom.mts` reads projections from a detached `MarkdownRenderer` inside the running app,
 * where the goldens were captured through wdio by `oracle.e2e.ts`. Two different call paths
 * into the same renderer, so "they agree" is an assumption until it is measured -- and these
 * notes carry several instances of a second oracle whose first findings were bugs in the
 * oracle rather than the package.
 *
 * Run over every `match` case carrying a `highlights`, `emphasis` or `math` value -- the
 * three projections the recorder has, so the only ones that can discriminate the two. It is
 * a MEASUREMENT and not a gate, for the reason `referee.mts` is: it needs Obsidian running
 * with this vault open, which CI does not have.
 *
 * Checking all 663 rather than a sample is what made it trustworthy. A 60-case sample at
 * stride 11 reported 60/60 twice while two substitutions were still missing: the math
 * sentinel showed up at 58/60, and the footnote sentinel appeared in exactly ONE case of the
 * 663. A sample would have shipped an oracle that silently disagreed on footnote references.
 */
import fs from "node:fs";
import path from "node:path";

import { askDom } from "./ask-dom.js";
import type { GoldenCase } from "./types.js";

const golden = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "goldens/obsidian.json"),
    "utf8",
  ),
) as { cases: Record<string, GoldenCase> };

// Cases the gate already asserts, carrying at least one of the three projections the
// recorder has. Anything else cannot discriminate the two oracles.
const candidates = Object.values(golden.cases).filter((entry) => {
  const p = entry.obsidian?.projections;
  if (!p || entry.triage !== "match") return false;
  return (
    (p.highlights?.length ?? 0) > 0 ||
    (p.emphasis?.length ?? 0) > 0 ||
    (p.math?.length ?? 0) > 0
  );
});

const stride = 1;
const sample = candidates
  .filter((_, index) => index % stride === 0)
  .slice(0, 10000);
console.log(
  `  candidates ${candidates.length}, sampling ${sample.length} at stride ${stride}`,
);

const answers = askDom(sample.map((entry) => entry.markdown));
let agree = 0;
const differ: string[] = [];
for (const [index, entry] of sample.entries()) {
  const want = entry.obsidian.projections;
  const got = answers[index]!;
  const same =
    JSON.stringify(want.highlights ?? []) === JSON.stringify(got.highlights) &&
    JSON.stringify(want.emphasis ?? []) === JSON.stringify(got.emphasis) &&
    JSON.stringify((want.math ?? []).map((m) => m.display)) ===
      JSON.stringify(got.math.map((m) => m.display));
  if (same) {
    agree++;
    continue;
  }
  differ.push(
    `${entry.id}\n      md    ${JSON.stringify(entry.markdown).slice(0, 70)}\n` +
      `      golden h=${JSON.stringify(want.highlights ?? [])} e=${JSON.stringify(want.emphasis ?? [])} m=${JSON.stringify((want.math ?? []).map((m) => m.display))}\n` +
      `      probe  h=${JSON.stringify(got.highlights)} e=${JSON.stringify(got.emphasis)} m=${JSON.stringify(got.math.map((m) => m.display))}`,
  );
}
console.log(`  agree ${agree} / ${sample.length}`);
for (const row of differ.slice(0, 10)) console.log(`    ${row}`);
