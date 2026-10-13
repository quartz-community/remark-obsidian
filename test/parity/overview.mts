/**
 * Prints the consolidated parity overview.
 *
 *     npx tsx --conditions=development test/parity/overview.mts
 *     npx tsx --conditions=development test/parity/overview.mts --live
 *
 * The registry itself lives in `overview.ts`, so `overview.test.ts` can gate it without
 * importing a script, and this file only formats.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AXES, ORACLES, SCOPE } from "./overview.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function rule(label: string): void {
  console.log(`\n${label}\n${"-".repeat(label.length)}`);
}

rule("ORACLES");
for (const oracle of ORACLES) {
  console.log(`\n  ${oracle.name}   [${oracle.gate}]`);
  console.log(`    run      ${oracle.command}`);
  console.log(`    compares ${oracle.compares.join(", ")}`);
  if (oracle.ceilingAt)
    console.log(`    ceiling  ${oracle.ceilingAt} (read it there)`);
  for (const blind of oracle.blind) console.log(`    BLIND TO ${blind}`);
}

rule("COMPOSITION AXES");
for (const axis of AXES) {
  const mark = axis.swept ? "swept" : "NOT SWEPT";
  console.log(
    `  ${axis.name.padEnd(34)}${String(axis.sequences ?? "?").padStart(5)}  ${mark.padEnd(10)}${axis.note}`,
  );
}

rule("SCOPE -- deliberately not measured");
for (const entry of SCOPE) {
  console.log(`  ${entry.what}\n      ${entry.why}`);
}

rule("CORPUS (free, from the committed golden)");
const golden = JSON.parse(
  fs.readFileSync(path.join(here, "goldens", "obsidian.json"), "utf8"),
) as { cases: Record<string, { triage?: string }> };
const triage = new Map<string, number>();
for (const entry of Object.values(golden.cases)) {
  const state = entry.triage ?? "unreviewed";
  triage.set(state, (triage.get(state) ?? 0) + 1);
}
console.log(`  cases ${Object.keys(golden.cases).length}`);
for (const [state, count] of [...triage].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${state.padEnd(14)}${count}`);
}

if (process.argv.includes("--live")) {
  rule("LIVE");
  const refereeDir = process.env.PARITY_REFEREE_DIR;
  console.log(
    refereeDir === undefined
      ? "  referee: PARITY_REFEREE_DIR unset, skipped"
      : `  referee corpus at ${refereeDir} -- run referee.mts for the figure`,
  );
  console.log("  compose: needs a running Obsidian; run compose.mts per axis");
}
