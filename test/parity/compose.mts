/**
 * Sweep sequences of constructs against a running Obsidian.
 *
 *     npx tsx --conditions=development test/parity/compose.mts [--matrix|--inside|--isolate|--nested|--inline|--inline-block]
 *     npx tsx --conditions=development test/parity/compose.mts --all
 *     npx tsx --conditions=development test/parity/compose.mts --record
 *
 * The construct tables, case generation, both sides' projections and the comparison live in
 * `compose.ts`; this file is the part that needs the app. `--record` writes every axis's
 * answers to `goldens/compose.json`, which is what makes these axes GATEABLE: `compose.test.ts`
 * then recomputes our side in CI with no Obsidian, the same trick that makes the main parity
 * gate authoritative.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { askDom } from "./ask-dom.js";
import {
  agrees,
  AXES,
  BLOCKS,
  casesFor,
  needsDom,
  oursFor,
  theirs,
  type Axis,
  type Facts,
} from "./compose.js";

const LOG_LINE = /^\d{4}-\d{2}-\d{2} /u;

function evaluate(code: string): string {
  return execFileSync("obsidian", ["eval", `code=${code}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 180_000,
  })
    .split("\n")
    .filter((line) => !LOG_LINE.test(line) && line.trim() !== "")
    .map((line) => line.replace(/^=> /u, ""))
    .join("\n")
    .trim();
}

function askBatch(documents: readonly string[]): unknown[] {
  const encoded = JSON.stringify(
    documents.map((text) => Buffer.from(text, "utf8").toString("base64")),
  );
  evaluate(
    `window.__cmp='pending';(async()=>{const qs=${encoded};const out=[];` +
      `for(const q of qs){const b=Uint8Array.from(atob(q),c=>c.charCodeAt(0)).buffer;` +
      `out.push(await app.metadataCache.computeMetadataAsync(b))}` +
      `window.__cmp=JSON.stringify(out)})()`,
  );
  let raw = "pending";
  for (let attempt = 0; attempt < 80 && raw === "pending"; attempt++) {
    raw = evaluate("window.__cmp");
  }
  if (raw === "pending") throw new Error("Obsidian did not finish");
  return JSON.parse(raw) as unknown[];
}

const BATCH = 60;

/** Obsidian's whole side for one axis, DOM half included where the axis needs it. */
function theirsFor(axis: Axis): Map<string, Facts> {
  const cases = casesFor(axis);
  const out = new Map<string, Facts>();
  for (let at = 0; at < cases.length; at += BATCH) {
    const slice = cases.slice(at, at + BATCH);
    const answers = askBatch(slice.map((entry) => entry.text));
    const dom = needsDom(axis)
      ? askDom(slice.map((entry) => entry.text))
      : undefined;
    for (const [index, entry] of slice.entries()) {
      const theirDom = dom?.[index];
      out.set(entry.name, {
        ...theirs(answers[index]),
        ...(theirDom === undefined
          ? {}
          : {
              dom: {
                highlights: theirDom.highlights,
                emphasis: theirDom.emphasis,
                strike: theirDom.strike,
                code: theirDom.code,
                mathDisplay: theirDom.math.map((entry2) => entry2.display),
              },
            }),
      });
    }
  }
  return out;
}

const GOLDEN = path.join(import.meta.dirname, "goldens/compose.json");

if (process.argv.includes("--record")) {
  const stamp = evaluate(
    "JSON.stringify({app: app.vault.getName(), version: app.appVersion ?? null})",
  );
  const recorded: Record<string, Record<string, Facts>> = {};
  for (const axis of AXES) {
    const answers = theirsFor(axis);
    recorded[axis] = Object.fromEntries(answers);
    console.log(`  ${axis.padEnd(14)}${answers.size} sequences`);
  }
  fs.writeFileSync(
    GOLDEN,
    `${JSON.stringify({ obsidian: JSON.parse(stamp), recordedAt: new Date().toISOString(), axes: recorded }, null, 2)}\n`,
  );
  console.log(`\n  wrote ${GOLDEN}`);
  process.exit(0);
}

if (process.argv.includes("--all")) {
  console.log("compose: every axis\n");
  let total = 0;
  let swept = 0;
  for (const axis of AXES) {
    const answers = theirsFor(axis);
    let diverge = 0;
    for (const entry of casesFor(axis)) {
      const want = answers.get(entry.name)!;
      let got: Facts;
      try {
        got = oursFor(entry.text, axis);
      } catch {
        diverge++;
        continue;
      }
      if (!agrees(want, got)) diverge++;
    }
    total += diverge;
    swept += answers.size;
    console.log(
      `  ${axis.padEnd(20)}${String(diverge).padStart(4)} of ${String(answers.size).padStart(5)}`,
    );
  }
  console.log(
    `\n  ${"TOTAL".padEnd(20)}${String(total).padStart(4)} of ${String(swept).padStart(5)}`,
  );
  console.log(
    "\n  Lower is better, and `compose.test.ts` now gates it: the committed golden means" +
      "\n  a regression fails CI rather than waiting to be noticed.",
  );
  process.exit(0);
}

/**
 * `--dump <file>` / `--blast <file>`, over EVERY axis, and this is the geometry half.
 *
 * `referee.mts --blast` closed the same hole for `defs` and `refs`, which is all that oracle
 * records. This gate is the one that holds `sections`, so a change that rewrites BLOCK
 * GEOMETRY from one wrong answer to another is invisible everywhere else -- the referee cannot
 * see sections at all, the corpus has five diverging cases in total, and these rows are
 * BINARY: `agrees(want, got)` collapses eight projections to a boolean, so a row that was
 * diverging and still diverges reports the same `1` either way.
 *
 * Sweeps all seven axes rather than the selected one, because a partial baseline would make
 * the next comparison silently narrower than it looks -- and that is the failure mode this
 * whole family of flags exists to catch.
 */
const valueOf = (flag: string): string | undefined => {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
};
const dumpTo = valueOf("--dump");
const blastFrom = valueOf("--blast");

if (dumpTo !== undefined || blastFrom !== undefined) {
  const snapshot: Record<string, { agreed: boolean; sig: string }> = {};
  const baseline: Record<string, { agreed: boolean; sig: string }> =
    blastFrom === undefined
      ? {}
      : (JSON.parse(fs.readFileSync(blastFrom, "utf8")) as typeof baseline);
  const rows: Array<{
    key: string;
    bucket: "gained" | "lost" | "still wrong";
    fields: string;
  }> = [];

  for (const ax of AXES) {
    const want = theirsFor(ax);
    for (const entry of casesFor(ax)) {
      const key = `${ax}/${entry.name}`;
      const theirs = want.get(entry.name);
      if (theirs === undefined) continue;
      let got: Facts;
      try {
        got = oursFor(entry.text, ax);
      } catch (error) {
        snapshot[key] = { agreed: false, sig: `THREW ${String(error)}` };
        continue;
      }
      const agreed = agrees(theirs, got);
      const sig = JSON.stringify(got);
      snapshot[key] = { agreed, sig };
      const was = baseline[key];
      if (was !== undefined && was.sig !== sig) {
        // WHICH projections moved, so a geometry-only change is legible as one.
        const before = JSON.parse(was.sig) as Record<string, unknown>;
        const fields = Object.keys(got).filter(
          (field) =>
            JSON.stringify(
              (got as unknown as Record<string, unknown>)[field],
            ) !== JSON.stringify(before[field]),
        );
        rows.push({
          key,
          bucket: agreed ? "gained" : was.agreed ? "lost" : "still wrong",
          fields: fields.join(","),
        });
      }
    }
  }

  if (dumpTo !== undefined) {
    fs.writeFileSync(dumpTo, JSON.stringify(snapshot));
    console.log(`dumped ${Object.keys(snapshot).length} rows to ${dumpTo}`);
    process.exit(0);
  }

  const buckets = new Map<string, number>();
  const fieldHits = new Map<string, number>();
  for (const row of rows) {
    buckets.set(row.bucket, (buckets.get(row.bucket) ?? 0) + 1);
    for (const field of row.fields.split(",").filter(Boolean)) {
      fieldHits.set(field, (fieldHits.get(field) ?? 0) + 1);
    }
  }
  console.log(`blast radius against ${blastFrom}`);
  console.log(
    `  rows ALTERED : ${rows.length} of ${Object.keys(snapshot).length}`,
  );
  for (const bucket of ["gained", "lost", "still wrong"]) {
    console.log(`    ${bucket.padEnd(12)} ${buckets.get(bucket) ?? 0}`);
  }
  if (fieldHits.size > 0) {
    console.log("\n  projections that moved:");
    for (const [field, count] of [...fieldHits].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(count).padStart(4)}  ${field}`);
    }
  }
  const silent = rows.filter((row) => row.bucket === "still wrong");
  if (silent.length > 0) {
    console.log(
      `\n  STILL WRONG -- rewritten while the row kept diverging. Binary rows cannot see these.`,
    );
    for (const row of silent.slice(0, 30)) {
      console.log(`    ${row.key}  [${row.fields}]`);
    }
    if (silent.length > 30)
      console.log(`    ... and ${silent.length - 30} more`);
  }
  process.exit(0);
}

const FLAGS: ReadonlyArray<readonly [string, Axis]> = [
  ["--matrix", "matrix"],
  ["--inside", "inside"],
  ["--isolate", "isolate"],
  ["--nested", "nested"],
  ["--inline-block", "inline-block"],
  ["--inline", "inline"],
];
const axis: Axis =
  FLAGS.find(([flag]) => process.argv.includes(flag))?.[1] ?? "pairs";

const cases = casesFor(axis);
console.log(`compose: ${cases.length} sequences\n`);
const answers = theirsFor(axis);
const diverged: string[] = [];
const rules = new Map<string, { obs: boolean; us: boolean }>();

/**
 * Whether the container swallowed a follower starting on `line`.
 *
 * `sections` is root-level, so the follower is absorbed exactly when no root section starts
 * on its line. The string is `${type}@${startLine}`, built in `compose.ts` with one `@` and a
 * numeric tail -- so unlike the LINK projection, which these notes record as not
 * round-trippable, this one has an unambiguous delimiter and may be read.
 */
const absorbed = (facts: Facts, line: number): boolean =>
  !facts.sections.some(
    (section) => Number(section.slice(section.lastIndexOf("@") + 1)) === line,
  );

for (const entry of cases) {
  const want = answers.get(entry.name)!;
  let got: Facts;
  try {
    got = oursFor(entry.text, axis);
  } catch (error) {
    diverged.push(`${entry.name}  THREW ${String(error).slice(0, 60)}`);
    continue;
  }
  if (entry.followerLine !== undefined) {
    rules.set(entry.name, {
      obs: absorbed(want, entry.followerLine),
      us: absorbed(got, entry.followerLine),
    });
  }
  if (agrees(want, got)) continue;
  diverged.push(
    `${entry.name}\n      md   ${JSON.stringify(entry.text)}\n` +
      `      obs  defs=${JSON.stringify(want.defs)} sections=${JSON.stringify(want.sections)} h=${JSON.stringify(want.headings)}\n` +
      `      ours defs=${JSON.stringify(got.defs)} sections=${JSON.stringify(got.sections)} h=${JSON.stringify(got.headings)}\n` +
      `      obs  l=${JSON.stringify(want.links)} e=${JSON.stringify(want.embeds)} t=${JSON.stringify(want.tags)} r=${JSON.stringify(want.refs)} b=${JSON.stringify(want.blocks)}\n` +
      `      ours l=${JSON.stringify(got.links)} e=${JSON.stringify(got.embeds)} t=${JSON.stringify(got.tags)} r=${JSON.stringify(got.refs)} b=${JSON.stringify(got.blocks)}` +
      (want.dom === undefined
        ? ""
        : `\n      obs  dom=${JSON.stringify(want.dom)}\n      ours dom=${JSON.stringify(got.dom)}`),
  );
}

if (axis === "matrix") {
  const width = Math.max(...BLOCKS.map(([name]) => name.length));
  const CONTAINERS = ["bullet", "ordered", "quote", "callout", "linkdef"];
  const head = CONTAINERS.map((c) => c.slice(0, 7).padStart(8)).join("");
  console.log(
    `  absorbed by the container?  A = absorbed, R = own root section`,
  );
  console.log(`  a cell is "obs/ours", and a disagreeing cell is marked *\n`);
  console.log(`  ${"follower".padEnd(width)}${head}`);
  for (const [followerName] of BLOCKS) {
    const cells = CONTAINERS.map((container) => {
      const rule = rules.get(`${container} > ${followerName}`);
      if (!rule) return "     -  ";
      const pair = `${rule.obs ? "A" : "R"}/${rule.us ? "A" : "R"}`;
      return `${rule.obs === rule.us ? " " : "*"}${pair}`.padStart(8);
    }).join("");
    console.log(`  ${followerName.padEnd(width)}${cells}`);
  }
  console.log("");
}

console.log(`  ${diverged.length} of ${cases.length} diverge\n`);
for (const entry of diverged.slice(0, 200)) console.log(`  ${entry}`);
if (diverged.length > 200) {
  console.log(`  ... and ${diverged.length - 200} more`);
}
