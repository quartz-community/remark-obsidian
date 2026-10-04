import fs from "node:fs";

import { compareCase } from "../compare.js";
import type { GoldenCase } from "../types.js";
import { generate } from "./generate.js";

/**
 * Report which seeds disagree with Obsidian.
 *
 * A fuzz run is not a gate and has no committed goldens: the sweep records a
 * seed range against Obsidian, this reads the result, and the output is a
 * list of seeds. Because generation is deterministic, a seed is the whole
 * reproduction — `generate(n)` on any machine yields the document that
 * failed, and promoting it into the permanent corpus is a copy and paste.
 *
 * Exits non-zero when anything disagrees so a scheduled run fails loudly.
 */
const path = process.argv[2];
if (!path) {
  console.error("usage: check <recorded-fuzz-golden.json>");
  process.exit(2);
}

const file = JSON.parse(fs.readFileSync(path, "utf8")) as {
  oracle?: { mathTex?: boolean };
  cases: Record<string, GoldenCase>;
};
const mathTex = file.oracle?.mathTex ?? false;
const entries = Object.values(file.cases);

const failures: Array<{ seed: number; keys: string[] }> = [];
let crashes = 0;

for (const entry of entries) {
  const result = compareCase(entry, mathTex);
  if (result.matched) continue;
  if (result.crash) crashes += 1;
  failures.push({
    seed: Number(entry.id.replace("fuzz/", "")),
    keys: result.crash
      ? ["CRASH: " + result.crash.slice(0, 60)]
      : result.divergences.map((d) => String(d.key)),
  });
}

const byKey: Record<string, number> = {};
for (const failure of failures) {
  for (const key of failure.keys) byKey[key] = (byKey[key] ?? 0) + 1;
}

console.log(
  `fuzz: ${entries.length - failures.length}/${entries.length} agree` +
    (crashes > 0 ? `, ${crashes} CRASHED` : ""),
);
if (failures.length > 0) {
  console.log("by projection:", JSON.stringify(byKey));
  console.log("\nfailing seeds, each reproducible with generate(seed):");
  for (const failure of failures.slice(0, 25)) {
    console.log(`\n  seed ${failure.seed}  [${failure.keys.join(", ")}]`);
    console.log(`  ${JSON.stringify(generate(failure.seed))}`);
  }
  if (failures.length > 25) {
    console.log(`\n  ... and ${failures.length - 25} more`);
  }
  console.log(`\nseeds: ${failures.map((failure) => failure.seed).join(",")}`);
}

process.exit(failures.length > 0 ? 1 : 0);
