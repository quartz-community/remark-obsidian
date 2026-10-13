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
  if (axis.how !== undefined)
    console.log(`  ${" ".repeat(34)}       run: ${axis.how}`);
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

/**
 * `--live` answers "where does parity stand" in one command.
 *
 * It reports the corpus headline in-process and then defers to the SUITE for every ceiling,
 * rather than recomputing any of them. That is deliberate: a dashboard that recalculates a
 * ceiling holds a second copy of it, and a second copy is what goes stale -- the failure this
 * whole file exists to prevent. So the ceilings are reported as "the gate that owns this
 * holds / does not hold", which is the only claim that cannot drift.
 */
if (process.argv.includes("--live")) {
  rule("LIVE -- corpus, in process");
  const { compareCase, PROFILE_NAMES } = await import("./compare.js");
  const file = JSON.parse(
    fs.readFileSync(path.join(here, "goldens", "obsidian.json"), "utf8"),
  ) as {
    oracle?: { mathTex?: boolean };
    obsidian: { app: string };
    cases: Record<string, Parameters<typeof compareCase>[0]>;
  };
  const mathTex = file.oracle?.mathTex ?? false;
  const shipping = PROFILE_NAMES[0]!;

  let matched = 0;
  let masked = 0;
  const diverging: string[] = [];
  for (const entry of Object.values(file.cases)) {
    const result = compareCase(entry, mathTex);
    if (!result.matched) {
      diverging.push(`${result.id} [${result.triage}]`);
      continue;
    }
    matched++;
    if (result.profile !== shipping) masked++;
  }
  const total = Object.keys(file.cases).length;
  console.log(`  recorded against Obsidian ${file.obsidian.app}`);
  console.log(`  matched            ${matched} / ${total}`);
  console.log(
    `  masked by profile  ${masked}  (pass only outside ${shipping})`,
  );
  console.log(`  diverging          ${diverging.length}`);
  for (const entry of diverging) console.log(`      ${entry}`);

  rule("LIVE -- every parity ceiling, via the gate that owns it");
  console.log(
    "  running test/parity only -- unit suites elsewhere are not parity oracles.\n" +
      "  No ceiling value is recomputed here; each gate asserts its own.\n",
  );
  const { spawnSync } = await import("node:child_process");
  const run = spawnSync(
    "npx",
    ["vitest", "run", "--reporter=basic", "test/parity"],
    {
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--conditions=development" },
    },
  );
  const lines = `${run.stdout ?? ""}${run.stderr ?? ""}`.split("\n");
  for (const line of lines) {
    if (/^\s*[✓×]\s+test\/parity\//u.test(line) || /Tests\s+\d/u.test(line)) {
      console.log(`  ${line.trim()}`);
    }
  }
  console.log(`\n  suite exit ${run.status}`);

  const refereeDir = process.env.PARITY_REFEREE_DIR;
  rule("LIVE -- referee");
  if (refereeDir === undefined) {
    console.log(
      "  PARITY_REFEREE_DIR unset, skipped (the corpus is not vendored)",
    );
  } else {
    const referee = spawnSync(
      "npx",
      ["tsx", "--conditions=development", "test/parity/referee.mts"],
      { encoding: "utf8", env: process.env },
    );
    for (const line of `${referee.stdout ?? ""}`.split("\n").slice(0, 3)) {
      if (line.trim() !== "") console.log(`  ${line.trim()}`);
    }
  }

  rule("LIVE -- composition");
  console.log("  needs a running Obsidian with a vault open; per axis:");
  for (const axis of AXES.filter((a) => a.swept)) {
    console.log(`      ${axis.name}`);
  }
}
