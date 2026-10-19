/**
 * Run a named probe grid against the running application.
 *
 *     npx tsx --conditions=development test/parity/grid.mts --list
 *     npx tsx --conditions=development test/parity/grid.mts lazy-release
 *     npx tsx --conditions=development test/parity/grid.mts --all
 *     npx tsx --conditions=development test/parity/grid.mts lazy-release --record
 *
 * `--record` appends every cell to a probe-ledger seed file, which is the half that was always
 * skipped by hand: of roughly three hundred cells measured in one session only about a hundred
 * and twenty reached the ledger, because promoting them meant writing them out again.
 */
import fs from "node:fs";
import { ask } from "./probe-channel.js";
import { cellsOf, documentsOf, render } from "./grid.js";
import { GRIDS, gridNamed } from "./grids.js";
import type { Grid } from "./grid.js";

const argv = process.argv.slice(2);

if (argv.includes("--list") || argv.length === 0) {
  console.log("grids:");
  for (const grid of GRIDS) {
    const cells = grid.rows.length * grid.cols.length;
    console.log(
      `  ${grid.name.padEnd(24)}${String(cells).padStart(4)} cells  ${grid.field.padEnd(18)}${grid.what}`,
    );
  }
  process.exit(0);
}

const wanted: readonly Grid[] = argv.includes("--all")
  ? GRIDS
  : argv
      .filter((arg) => !arg.startsWith("--"))
      .map((name) => {
        const grid = gridNamed(name);
        if (!grid) {
          console.error(`grid: no grid named ${name}`);
          process.exit(1);
        }
        return grid;
      });

const seeds: { markdown: string; note: string }[] = [];
let diverging = 0;
let total = 0;

for (const grid of wanted) {
  const docs = documentsOf(grid);
  const answers = await ask(docs);
  const cells = cellsOf(grid, answers);
  console.log(`\n${render(grid, cells)}`);
  for (const cell of cells) {
    total++;
    if (cell.theirs !== cell.ours) diverging++;
    seeds.push({
      markdown: cell.text,
      note: `grid/${grid.name}/${cell.row}|${cell.col}`.replace(/\s+/gu, "-"),
    });
  }
}

if (wanted.length > 1) {
  console.log(`\n  TOTAL ${diverging} of ${total} cells diverge`);
}

const recordAt = argv.indexOf("--record");
if (recordAt !== -1) {
  // Appended to an existing seed file rather than replacing it, and deduplicated by markdown,
  // because the ledger's own recorder does the same and a grid shares shapes with the probes
  // promoted before it.
  const path = argv[recordAt + 1] ?? "/tmp/opencode/all.json";
  const existing: { markdown: string; note: string }[] = fs.existsSync(path)
    ? (JSON.parse(fs.readFileSync(path, "utf8")) as typeof existing)
    : [];
  const seen = new Set(existing.map((entry) => entry.markdown));
  const added = seeds.filter((seed) => !seen.has(seed.markdown));
  fs.writeFileSync(path, JSON.stringify([...existing, ...added]));
  console.log(
    `\n  ${path}: ${existing.length} -> ${existing.length + added.length} seeds (${added.length} new)`,
  );
}
