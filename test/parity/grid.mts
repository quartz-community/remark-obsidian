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
import { ask, askBlockCode } from "./probe-channel.js";
import { cellOf, cellsOf, documentsOf, oursFor, render } from "./grid.js";
import { GRIDS, gridNamed } from "./grids.js";
import type { Grid } from "./grid.js";

const argv = process.argv.slice(2);

/**
 * THE SWEEP, as distinct from the named grids above it.
 *
 * Every registered grid CONFIRMS: it was built after a shrink cluster pointed at a family, to
 * find that family's boundaries. None of them goes looking. `compose.mts` is the counter-example
 * -- it sweeps 2112 sequences nobody suspected and found rules that way, including a regression
 * landed the same day.
 *
 * And the space it sweeps is not this one. Seven of its eight axes hold INDENTATION FIXED, with
 * a constant container prefix on every line, while six of the seven rules landed in this session
 * were about indentation: a tab reaching its stop, a tab after a space reaching nothing, a line
 * below a content column, a closer below an opening column, a lazy line at four columns.
 *
 * So this sweeps the complement: four container hosts against all sixteen `BLOCKS` against the
 * indent ladder, 448 cells, reporting only what diverges.
 */
async function sweep(): Promise<void> {
  const { BLOCKS } = await import("./compose.js");
  const HOSTS: ReadonlyArray<readonly [string, string]> = [
    ["quote", "> quote"],
    ["callout", "> [!note] title"],
    ["bullet", "- item"],
    ["ordered", "1. item"],
  ];
  const INDENTS: ReadonlyArray<readonly [string, string]> = [
    ["0sp", ""],
    ["2sp", "  "],
    ["3sp", "   "],
    ["4sp", "    "],
    ["5sp", "     "],
    ["tab", "\t"],
    ["2sp+tab", "  \t"],
  ];

  const docs: string[] = [];
  const keys: { host: string; block: string; indent: string }[] = [];
  for (const [hostName, head] of HOSTS) {
    for (const [blockName, block] of BLOCKS) {
      for (const [indentName, indent] of INDENTS) {
        const body = block
          .split("\n")
          .map((line) => `${indent}${line}`)
          .join("\n");
        docs.push(`${head}\n${body}\n\nuse[^1]\n`);
        keys.push({ host: hostName, block: blockName, indent: indentName });
      }
    }
  }

  console.log(`sweep: ${docs.length} cells -- hosts x BLOCKS x indents\n`);
  const diverging: string[] = [];
  for (let at = 0; at < docs.length; at += 60) {
    const slice = docs.slice(at, at + 60);
    const answers = await ask(slice);
    for (let i = 0; i < slice.length; i++) {
      const key = keys[at + i]!;
      const theirs = answers[i]!;
      const mine = oursFor(slice[i]!);
      for (const field of [
        "code.exists",
        "def.exists",
        "refs.count",
      ] as const) {
        // REFS ARE NOT ADJUDICABLE when the augmentation did not take. `footnoteRefs` is
        // definition-gated, so references are read from a copy carrying one synthesised
        // definition per name -- and a document that SWALLOWS its tail eats them. An unclosed
        // `%%` is the measured case, and it is what half this sweep's cells contain.
        //
        // The first run reported EIGHT `comment` rows as `obs=0 ours=1` across all four hosts,
        // which read as a clean new family. Every one was the probe never firing.
        // `liveSignature` carries this guard already; new code walked into the same trap.
        if (field === "refs.count" && !theirs.refsTrustworthy) continue;
        const a = cellOf(field, theirs);
        const b = cellOf(field, mine);
        if (a === b) continue;
        diverging.push(
          `    ${key.host.padEnd(8)} ${key.block.padEnd(10)} ${key.indent.padEnd(8)} ${field.padEnd(12)} obs=${a} ours=${b}`,
        );
      }
    }
  }
  // Every cell is a seed, not only the diverging ones: the VALUE of a sweep is that 445 of
  // 448 agree, and a ledger holding only the three failures would not notice if one of the 445
  // started failing.
  const at2 = argv.indexOf("--record");
  if (at2 !== -1) {
    const path = argv[at2 + 1] ?? "/tmp/opencode/all.json";
    const existing: { markdown: string; note: string }[] = fs.existsSync(path)
      ? (JSON.parse(fs.readFileSync(path, "utf8")) as typeof existing)
      : [];
    const seen = new Set(existing.map((entry) => entry.markdown));
    const added = docs
      .map((markdown, i) => ({
        markdown,
        note: `sweep/${keys[i]!.host}/${keys[i]!.block}/${keys[i]!.indent}`,
      }))
      .filter((seed) => !seen.has(seed.markdown));
    fs.writeFileSync(path, JSON.stringify([...existing, ...added]));
    console.log(
      `  ${path}: ${existing.length} -> ${existing.length + added.length} seeds (${added.length} new)\n`,
    );
  }
  const byCell = new Set(diverging.map((row) => row.slice(0, 32)));
  console.log(
    `  ${byCell.size} of ${docs.length} cells diverge on some field\n`,
  );
  console.log(diverging.slice(0, 40).join("\n"));
  if (diverging.length > 40) {
    console.log(`    ... and ${diverging.length - 40} more field-level rows`);
  }
}

/**
 * THE SEPARATOR SPACE: marker type against separator width against label indent.
 *
 * The indent sweep came back 3 of 448, retiring that space. This is the complement that
 * `marker-sep-column` sampled at 5 rows by 7 columns and found +33 in -- the five-space cap,
 * refused from six directions and still the largest thing `def-miss @ code` reduces to.
 *
 * Swept rather than sampled because the cap is a SINGLE ARITHMETIC FACT -- `contentColumn`
 * computes it from one line -- which is the screen this file derived for when a grid collapses
 * usefully: a column delta does and a span delta does not.
 */
async function sweepSeparator(): Promise<void> {
  const MARKERS = ["-", "*", "+", "1.", "1)", "10.", "1000."];
  const SEPS: ReadonlyArray<readonly [string, string]> = [
    ["1sp", " "],
    ["2sp", "  "],
    ["3sp", "   "],
    ["4sp", "    "],
    ["5sp", "     "],
    ["6sp", "      "],
    ["8sp", "        "],
    ["tab", "\t"],
    ["tab2sp", "\t  "],
    ["sp+tab", " \t"],
  ];
  const INDENTS: ReadonlyArray<readonly [string, string]> = [
    ["0sp", ""],
    ["2sp", "  "],
    ["3sp", "   "],
    ["4sp", "    "],
    ["5sp", "     "],
    ["6sp", "      "],
    ["tab", "\t"],
  ];

  const docs: string[] = [];
  const keys: { marker: string; sep: string; indent: string }[] = [];
  for (const marker of MARKERS) {
    for (const [sepName, sep] of SEPS) {
      for (const [indentName, indent] of INDENTS) {
        docs.push(`${marker}${sep}Prose\n\n${indent}[^1]: def\n\nuse[^1]\n`);
        keys.push({ marker, sep: sepName, indent: indentName });
      }
    }
  }

  console.log(
    `sweep: ${docs.length} cells -- marker x separator x label indent\n`,
  );
  const rows: string[] = [];
  for (let at = 0; at < docs.length; at += 60) {
    const slice = docs.slice(at, at + 60);
    const answers = await ask(slice);
    for (let i = 0; i < slice.length; i++) {
      const key = keys[at + i]!;
      const a = cellOf("def.col", answers[i]!);
      const b = cellOf("def.col", oursFor(slice[i]!));
      if (a === b) continue;
      rows.push(
        `    ${key.marker.padEnd(7)} sep ${key.sep.padEnd(7)} label ${key.indent.padEnd(5)} obs=${String(a).padStart(3)} ours=${String(b).padStart(3)}`,
      );
    }
  }
  const at3 = argv.indexOf("--record");
  if (at3 !== -1) {
    const path = argv[at3 + 1] ?? "/tmp/opencode/all.json";
    const existing: { markdown: string; note: string }[] = fs.existsSync(path)
      ? (JSON.parse(fs.readFileSync(path, "utf8")) as typeof existing)
      : [];
    const seen = new Set(existing.map((entry) => entry.markdown));
    const added = docs
      .map((markdown, i) => ({
        markdown,
        note: `sep/${keys[i]!.marker}/${keys[i]!.sep}/${keys[i]!.indent}`.replace(
          /[^\w/.+-]/gu,
          "",
        ),
      }))
      .filter((seed) => !seen.has(seed.markdown));
    fs.writeFileSync(path, JSON.stringify([...existing, ...added]));
    console.log(
      `  ${path}: ${existing.length} -> ${existing.length + added.length} seeds (${added.length} new)\n`,
    );
  }
  console.log(`  ${rows.length} of ${docs.length} cells diverge on def.col\n`);
  console.log(rows.slice(0, 36).join("\n"));
  if (rows.length > 36) console.log(`    ... and ${rows.length - 36} more`);
}

if (argv.includes("--sweep-separator")) {
  await sweepSeparator();
  process.exit(0);
}

if (argv.includes("--sweep")) {
  await sweep();
  process.exit(0);
}

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
  const cells = cellsOf(
    grid,
    answers,
    grid.field === "code.in-item" ? askBlockCode(docs) : undefined,
  );
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
