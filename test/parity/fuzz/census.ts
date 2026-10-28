import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import remarkObsidian from "../../../src/index.js";
import { generate } from "./generate.js";
import { CONFIGS, invariantViolations } from "./invariants.js";
import { candidates } from "./shrink.js";

/**
 * The invariant fuzz over a large seed range, sharded across processes, then shrunk and grouped
 * into families. Needs no Obsidian. A million seeds take about 42 minutes on 16 cores.
 *
 *   npx tsx --conditions=development test/parity/fuzz/census.ts <from> <count> --out <dir> \
 *     [--workers <n>] [--baseline <dir|file>] [--update-baseline <file>] [--reset-baseline <file>]
 *
 * Where `invariant-sweep.ts` reports one document per violation, this sizes the problem: every
 * failing (seed, violation) is shrunk once, under the first configuration it fails, and the
 * minimal forms are clustered by violation, preset and the node types formatting loses or gains.
 * Grouping by form alone is useless -- 1,631 of the first census's 1,722 forms were unique.
 *
 * Writes into `<dir>`: `findings.json` (every failing seed and configuration), `clusters.json`
 * (each example with its own seed) and `report.md`, whose forms escape every character outside
 * printable ASCII. With `--baseline <dir>`, a previous run's directory, it also reports the seeds
 * fixed and the seeds failing that did not before, and exits 1 on any new one. The baseline is a
 * run's directory or a `findings.json`, such as the committed `goldens/census-baseline.json`;
 * `--update-baseline <file>` rewrites that file from this run, and refuses while any seed is
 * new, so it only ever records progress. `--reset-baseline <file>` writes it regardless, for the
one case where a new seed is not a regression: the invariant set itself grew. A seed counts as
new when it fails a violation the baseline does not record for it. A census re-run
 * after a round of fixes caught 691 regressions no other gate saw (AGENTS.md, "Fuzzing").
 */

/**
 * A form as a JSON string with every character outside printable ASCII escaped. A no-break space
 * printed as a space sent an investigation after state shared between documents that did not
 * exist: `  &amp;\u00a0` read as `  &amp; `, which passed.
 */
function visible(form: string): string {
  return JSON.stringify(form).replace(/[^\x20-\x7e]/gu, (character) =>
    [...character]
      .map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`)
      .join(""),
  );
}

/** Which preset a set of failing configurations implicates. */
function presetOf(configs: readonly string[]): string {
  const legacy = configs.some((c) => c.includes("legacy") || c === "all-off");
  const strict = configs.some((c) => c.includes("strict"));
  return legacy && strict ? "both" : legacy ? "legacy" : "strict";
}

/** Preference order for the one configuration a finding is shrunk under. */
const ORDER = ["legacy", "strict", "quartz-strict", "all-off", "quartz-legacy"];

interface Finding {
  readonly seed: number;
  readonly config: string;
  readonly kinds: readonly string[];
}
interface Job {
  readonly seed: number;
  readonly kind: string;
  readonly config: string;
  readonly configs: readonly string[];
}
interface Shrunk extends Job {
  readonly minimal: string;
}

/** Sweep `count` seeds from `from`, writing every failing seed and configuration. */
async function sweepShard(from: number, count: number, out: string) {
  const found: Finding[] = [];
  for (let seed = from; seed < from + count; seed++) {
    const markdown = generate(seed);
    for (const [config, options] of Object.entries(CONFIGS)) {
      let kinds: string[];
      try {
        kinds = await invariantViolations(markdown, options);
      } catch (error) {
        kinds = [`harness threw: ${String(error).slice(0, 80)}`];
      }
      if (kinds.length > 0) found.push({ seed, config, kinds });
    }
  }
  fs.writeFileSync(out, JSON.stringify(found));
}

/** Shrink every `workers`-th job, from `worker`, to its smallest form failing the same way. */
async function shrinkShard(
  jobsPath: string,
  worker: number,
  workers: number,
  out: string,
) {
  const jobs = JSON.parse(fs.readFileSync(jobsPath, "utf8")) as Job[];
  const results: Shrunk[] = [];
  for (let index = worker; index < jobs.length; index += workers) {
    const job = jobs[index]!;
    const options = CONFIGS[job.config]!;
    let markdown = generate(job.seed);
    for (let shrunk = true, rounds = 0; shrunk && rounds < 400; rounds++) {
      shrunk = false;
      for (const candidate of candidates(markdown)) {
        let violations: string[];
        try {
          violations = await invariantViolations(candidate, options);
        } catch {
          continue;
        }
        if (violations.includes(job.kind)) {
          markdown = candidate;
          shrunk = true;
          break;
        }
      }
    }
    results.push({ ...job, minimal: markdown });
  }
  fs.writeFileSync(out, JSON.stringify(results));
}

/** Run this script once per shard, in parallel, and wait for every one. */
async function fanOut(argsFor: (worker: number) => string[], workers: number) {
  const script = fileURLToPath(import.meta.url);
  const runs = Array.from(
    { length: workers },
    (_, worker) =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [...process.execArgv, script, ...argsFor(worker)],
          { stdio: ["ignore", "ignore", "inherit"] },
        );
        child.on("exit", (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`shard ${worker} exited ${code}`)),
        );
      }),
  );
  await Promise.all(runs);
}

/** The node types in a tree, bar the ones every document holds. */
function typesOf(tree: Node): Set<string> {
  const types = new Set<string>();
  visit(tree, (node: Node) => {
    types.add(node.type);
  });
  for (const common of ["root", "paragraph", "text"]) types.delete(common);
  return types;
}

/** What one format of `markdown` loses and gains, by node type, under `config`. */
function deltaOf(markdown: string, config: string) {
  const options = CONFIGS[config]!;
  const parser = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, options);
  const formatter = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, options)
    .use(remarkStringify);
  try {
    const formatted = String(formatter.processSync(markdown));
    const before = typesOf(parser.runSync(parser.parse(markdown), markdown));
    const after = typesOf(parser.runSync(parser.parse(formatted), formatted));
    return {
      formatted,
      lost: [...before].filter((type) => !after.has(type)).sort(),
      gained: [...after].filter((type) => !before.has(type)).sort(),
    };
  } catch (error) {
    return {
      formatted: `threw: ${String(error).slice(0, 80)}`,
      lost: [],
      gained: [],
    };
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Worker modes, spawned by the census itself.
  if (args[0] === "--sweep-shard") {
    await sweepShard(Number(args[1]), Number(args[2]), args[3]!);
    return;
  }
  if (args[0] === "--shrink-shard") {
    await shrinkShard(args[1]!, Number(args[2]), Number(args[3]), args[4]!);
    return;
  }

  const option = (name: string): string | undefined => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args.splice(at, 2)[1];
  };
  const out = option("--out");
  const baseline = option("--baseline");
  const reset = option("--reset-baseline");
  const updateBaseline = option("--update-baseline") ?? reset;
  const workers = Number(option("--workers") ?? os.availableParallelism());
  const from = Number(args[0]);
  const count = Number(args[1]);
  if (
    !out ||
    !Number.isInteger(from) ||
    !Number.isInteger(count) ||
    count <= 0 ||
    !Number.isInteger(workers) ||
    workers <= 0
  ) {
    process.stderr.write(
      "usage: census <from> <count> --out <dir> [--workers <n>] [--baseline <dir|file>] [--update-baseline <file>] [--reset-baseline <file>]\n",
    );
    process.exit(2);
  }
  fs.mkdirSync(out, { recursive: true });
  const started = Date.now();
  const log = (line: string) =>
    process.stderr.write(
      `[${Math.round((Date.now() - started) / 1000)}s] ${line}\n`,
    );

  // 1. Sweep, sharded by seed range.
  const size = Math.ceil(count / workers);
  log(`sweeping ${count} seeds from ${from} on ${workers} workers`);
  await fanOut((worker) => {
    const start = from + worker * size;
    const length = Math.max(0, Math.min(size, from + count - start));
    return [
      "--sweep-shard",
      String(start),
      String(length),
      path.join(out, `sweep-${worker}.json`),
    ];
  }, workers);
  const findings: Finding[] = [];
  for (let worker = 0; worker < workers; worker++) {
    const file = path.join(out, `sweep-${worker}.json`);
    findings.push(...(JSON.parse(fs.readFileSync(file, "utf8")) as Finding[]));
    fs.rmSync(file);
  }
  fs.writeFileSync(path.join(out, "findings.json"), JSON.stringify(findings));
  const seeds = new Set(findings.map((finding) => finding.seed));
  log(`${findings.length} failing pairs, ${seeds.size} seeds`);

  // 2. Shrink each (seed, violation) once, under its first failing configuration.
  const byKey = new Map<string, { configs: string[] } & Omit<Job, "config">>();
  for (const finding of findings) {
    for (const kind of finding.kinds) {
      const key = `${finding.seed}\u0000${kind}`;
      const entry = byKey.get(key) ?? {
        seed: finding.seed,
        kind,
        configs: [],
      };
      entry.configs.push(finding.config);
      byKey.set(key, entry);
    }
  }
  const jobs: Job[] = [...byKey.values()].map((entry) => ({
    ...entry,
    config: ORDER.find((config) => entry.configs.includes(config))!,
  }));
  const jobsPath = path.join(out, "jobs.json");
  fs.writeFileSync(jobsPath, JSON.stringify(jobs));
  log(`shrinking ${jobs.length} findings`);
  await fanOut(
    (worker) => [
      "--shrink-shard",
      jobsPath,
      String(worker),
      String(workers),
      path.join(out, `shrink-${worker}.json`),
    ],
    workers,
  );
  const shrunk: Shrunk[] = [];
  for (let worker = 0; worker < workers; worker++) {
    const file = path.join(out, `shrink-${worker}.json`);
    shrunk.push(...(JSON.parse(fs.readFileSync(file, "utf8")) as Shrunk[]));
    fs.rmSync(file);
  }
  fs.rmSync(jobsPath);

  // 3. Group by violation, preset and what formatting loses or gains.
  const clusters = new Map<
    string,
    {
      kind: string;
      preset: string;
      lost: string[];
      gained: string[];
      seeds: number[];
      examples: {
        seed: number;
        minimal: string;
        formatted: string;
        configs: readonly string[];
      }[];
    }
  >();
  for (const finding of shrunk) {
    const delta = deltaOf(finding.minimal, finding.config);
    const preset = presetOf(finding.configs);
    const key = [finding.kind, preset, delta.lost, delta.gained].join("|");
    const cluster = clusters.get(key) ?? {
      kind: finding.kind,
      preset,
      lost: delta.lost,
      gained: delta.gained,
      seeds: [],
      examples: [],
    };
    cluster.seeds.push(finding.seed);
    cluster.examples.push({
      seed: finding.seed,
      minimal: finding.minimal,
      formatted: delta.formatted,
      configs: finding.configs,
    });
    clusters.set(key, cluster);
  }
  const ranked = [...clusters.values()].sort(
    (a, b) => b.seeds.length - a.seeds.length,
  );
  for (const cluster of ranked) {
    cluster.examples.sort((a, b) => a.minimal.length - b.minimal.length);
  }
  fs.writeFileSync(
    path.join(out, "clusters.json"),
    `${JSON.stringify(ranked, null, 1)}\n`,
  );

  // 4. Against a baseline, by seed and violation: a seed the baseline records for one kind
  // (`format: changes the tree`) that now fails another (`changes the words`) is new.
  let fresh: number[] = [];
  let fixed: number[] = [];
  if (baseline) {
    // Only the baseline's seeds inside this run's range: a wider baseline would count every
    // seed beyond it as fixed.
    const before = new Map<number, Set<string>>();
    for (const finding of JSON.parse(
      fs.readFileSync(
        fs.statSync(baseline).isDirectory()
          ? path.join(baseline, "findings.json")
          : baseline,
        "utf8",
      ),
    ) as Finding[]) {
      if (finding.seed < from || finding.seed >= from + count) continue;
      const known = before.get(finding.seed) ?? new Set<string>();
      for (const kind of finding.kinds) known.add(kind);
      before.set(finding.seed, known);
    }
    const now = new Set<number>();
    for (const finding of findings) {
      const known = before.get(finding.seed);
      if (!known || finding.kinds.some((kind) => !known.has(kind))) {
        now.add(finding.seed);
      }
    }
    fresh = [...now].sort((a, b) => a - b);
    fixed = [...before.keys()]
      .filter((seed) => !seeds.has(seed))
      .sort((a, b) => a - b);
  }

  // 5. The report.
  const kinds = new Map<string, number>();
  for (const finding of findings) {
    for (const kind of finding.kinds)
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  }
  const lines = [
    `# Invariant census: seeds ${from}-${from + count - 1}`,
    "",
    `${seeds.size} failing seeds (${((100 * seeds.size) / count).toFixed(2)}%), ` +
      `${findings.length} seed-and-configuration pairs, ${shrunk.length} shrunk, ` +
      `${ranked.length} clusters; ${Math.round((Date.now() - started) / 60000)} minutes on ` +
      `${workers} workers.`,
    "",
    ...[...kinds].map(([kind, n]) => `- ${n} \`${kind}\``),
  ];
  if (baseline) {
    lines.push(
      "",
      `Against \`${baseline}\`: ${fixed.length} seeds fixed, **${fresh.length} newly failing**` +
        (fresh.length > 0 ? ` (first: ${fresh.slice(0, 10).join(", ")})` : "") +
        ".",
    );
  }
  lines.push(
    "",
    "| seeds | violation | preset | lost | gained | smallest form |",
    "| ---: | --- | --- | --- | --- | --- |",
  );
  for (const cluster of ranked) {
    const kind = cluster.kind.replace(/\|/gu, "\\|");
    const form = visible(cluster.examples[0]!.minimal)
      .slice(0, 80)
      .replace(/\|/gu, "\\|")
      .replace(/`/gu, "'");
    lines.push(
      `| ${cluster.seeds.length} | ${kind} | ${cluster.preset} | ${cluster.lost.join(", ")} | ` +
        `${cluster.gained.join(", ")} | \`${form}\` |`,
    );
  }
  fs.writeFileSync(path.join(out, "report.md"), `${lines.join("\n")}\n`);
  log(`report: ${path.join(out, "report.md")}`);
  process.stdout.write(
    `${lines.slice(0, baseline ? 6 + kinds.size : 4 + kinds.size).join("\n")}\n`,
  );
  // Queued writes, and no exit: a pipe can lose what process.exit discards (AGENTS.md).
  // A baseline only moves forward: written when nothing failed that the old one passed.
  if (updateBaseline) {
    if (fresh.length > 0 && !reset) {
      log(
        `not updating ${updateBaseline}: ${fresh.length} seeds fail that the baseline passed`,
      );
    } else {
      const sorted = [...findings].sort(
        (a, b) => a.seed - b.seed || a.config.localeCompare(b.config),
      );
      fs.writeFileSync(updateBaseline, `${JSON.stringify(sorted)}\n`);
      log(`baseline written: ${updateBaseline} (${sorted.length} pairs)`);
    }
  }
  process.exitCode = baseline && fresh.length > 0 && !reset ? 1 : 0;
}

await main();
