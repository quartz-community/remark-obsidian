import { generate } from "./generate.js";
import { CONFIGS, invariantViolations } from "./invariants.js";
import { candidates } from "./shrink.js";

/**
 * Sweep a seed range for broken invariants under every configuration, then shrink one document
 * per violation. Needs no Obsidian, so it runs anywhere and fast.
 *
 *   npx tsx --conditions=development test/parity/fuzz/invariant-sweep.ts <from> <count> \
 *     [--ignore "format: changes the words"]
 *
 * Output groups by `config: violation`, with the smallest reproducing document for each, ready
 * to paste into a test. Exits 1 when anything broke.
 */
const args = process.argv.slice(2);
/** `--ignore <violation>` (repeatable): a kind already recorded, which nightly runs should not re-report. */
const ignored = new Set<string>();
for (
  let at = args.indexOf("--ignore");
  at !== -1;
  at = args.indexOf("--ignore")
) {
  ignored.add(args[at + 1] ?? "");
  args.splice(at, 2);
}
const from = Number(args[0]);
const count = Number(args[1] ?? "1000");
if (!Number.isInteger(from) || !Number.isInteger(count) || count <= 0) {
  process.stderr.write("usage: invariant-sweep <from> <count>\n");
  process.exit(2);
}

/** The first document, per `config: violation`, and how many seeds hit it. */
const hits = new Map<
  string,
  { seed: number; markdown: string; seeds: number }
>();
for (let seed = from; seed < from + count; seed++) {
  const markdown = generate(seed);
  for (const [name, options] of Object.entries(CONFIGS)) {
    for (const violation of await invariantViolations(markdown, options)) {
      if (ignored.has(violation)) continue;
      const key = `${name}: ${violation}`;
      const hit = hits.get(key);
      if (hit) hit.seeds++;
      else hits.set(key, { seed, markdown, seeds: 1 });
    }
  }
}

process.stderr.write(
  `${count} seeds x ${Object.keys(CONFIGS).length} configurations: ${hits.size} violation kinds\n`,
);
if (hits.size === 0) {
  process.stdout.write(`invariants: all ${count} seeds hold every invariant\n`);
} else {
  // Greedy shrink: keep the smallest candidate that still breaks the same invariant.
  for (const [key, hit] of [...hits].sort((a, b) => b[1].seeds - a[1].seeds)) {
    const name = key.slice(0, key.indexOf(": "));
    const violation = key.slice(key.indexOf(": ") + 2);
    let markdown = hit.markdown;
    for (let shrunk = true; shrunk;) {
      shrunk = false;
      for (const candidate of candidates(markdown)) {
        if (
          (await invariantViolations(candidate, CONFIGS[name]!)).includes(
            violation,
          )
        ) {
          markdown = candidate;
          shrunk = true;
          break;
        }
      }
    }
    process.stdout.write(
      `\n${key}  (${hit.seeds} seeds, first ${hit.seed})\n  ${JSON.stringify(markdown)}\n`,
    );
  }
}
// Queued writes, and no exit: a pipe can lose what process.exit discards (AGENTS.md).
process.exitCode = hits.size === 0 ? 0 : 1;
