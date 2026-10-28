import { compareCase } from "../compare.js";
import type { GoldenCase } from "../types.js";
import { generate } from "./generate.js";
import { recordBatch } from "./record.js";
import { shrinkAll } from "./shrink.js";

/**
 * Sweep a seed range, then reduce what fails to a list of causes.
 *
 * A sweep that only names seeds hands over work rather than findings. Raw
 * failures do not group: a generated document carries six to eight constructs,
 * so grouping ninety-four of them by which projections diverged and which
 * constructs appeared gave ninety classes and eighty-six singletons — no
 * grouping at all. Shrinking first is what turns a flood into a backlog.
 *
 *   npx tsx --conditions=development test/parity/fuzz/sweep.ts <from> <count>
 *
 * Every line of output is reproducible: generation is deterministic from the
 * seed, and a minimal form can be pasted straight into `SEEDS`.
 */
const from = Number(process.argv[2]);
const count = Number(process.argv[3] ?? "200");
if (!Number.isInteger(from) || !Number.isInteger(count) || count <= 0) {
  console.error("usage: sweep <from> <count>");
  process.exit(2);
}

const seeds = Array.from({ length: count }, (_, index) => from + index);
process.stderr.write(`recording seeds ${from}..${from + count - 1}\n`);

const { cases, mathTex } = recordBatch(
  seeds.map((seed) => ({ id: `fuzz/${seed}`, markdown: generate(seed) })),
);

/**
 * An embed with no target -- `![[ ]]`, `![[#heading]]` -- embeds the note into itself, and
 * Obsidian then renders the note's tags, math and tasks once per level of the recursion (six in
 * every recorded case). That is vault resolution, outside this package, and `fuzz/embed/64` is
 * triaged `out-of-scope` for it; on 2026-10-28 it was 6 of the 19 causes a sweep reported.
 */
const SELF_EMBED = /!\[\[\s*(?:#[^\]]*)?\]\]/u;

const failures = new Map<string, string>();
let crashes = 0;
let selfEmbeds = 0;
for (const seed of seeds) {
  const golden = cases[`fuzz/${seed}`] as GoldenCase | undefined;
  if (!golden) continue;
  if (SELF_EMBED.test(golden.markdown)) {
    selfEmbeds += 1;
    continue;
  }
  const result = compareCase(golden, mathTex);
  if (result.matched) continue;
  if (result.crash) crashes += 1;
  failures.set(String(seed), golden.markdown);
}

process.stderr.write(
  `${seeds.length - selfEmbeds - failures.size}/${seeds.length - selfEmbeds} agree` +
    (crashes > 0 ? `, ${crashes} CRASHED` : "") +
    (selfEmbeds > 0 ? `, ${selfEmbeds} self-embedding skipped` : "") +
    `\n`,
);

if (failures.size === 0) {
  console.log(`fuzz: all ${seeds.length} seeds agree with Obsidian`);
  process.exit(0);
}

process.stderr.write(`shrinking ${failures.size} failures\n`);
const minimal = shrinkAll(failures);

// The dedup key is the reduced document itself: two seeds that shrink to the
// same text are the same bug however different they started.
const byForm = new Map<string, string[]>();
for (const [seed, markdown] of minimal) {
  const seen = byForm.get(markdown) ?? [];
  seen.push(seed);
  byForm.set(markdown, seen);
}

const forms = [...byForm].sort((a, b) => b[1].length - a[1].length);
console.log(
  `\nfuzz: ${failures.size} failing seeds reduce to ${forms.length} distinct causes\n`,
);
for (const [markdown, seeds_] of forms) {
  const also = seeds_.length > 1 ? `  (${seeds_.length} seeds)` : "";
  console.log(`  ${JSON.stringify(markdown)}${also}`);
  console.log(`      seed ${seeds_[0]}, ${markdown.length} chars`);
}

process.exit(1);
