/**
 * Does every instrument still reproduce its recorded headline figure?
 *
 *     PARITY_REFEREE_DIR=... npx tsx --conditions=development test/parity/instruments.mts
 *     ...--record    to accept the current figures as the new baseline
 *
 * WHY: `compose.mts` was DEAD for an unknown period. Every one of its seven axes threw before
 * asking Obsidian anything, because 256 sequences in one `obsidian eval code=` argument is about
 * 6KB and `execFileSync` fails outright -- and the figures quoted from it all week came from a
 * tool that no longer ran. Nothing noticed, because nothing watches the watchers.
 *
 * Four more instrument defects turned up in the same stretch, all the same shape -- a count
 * quietly wrong rather than an error: `score.mts` folding `code` into agreement and reporting
 * 5677 where the referee says 5745, the mechanism labeller collapsing duplicate names, the
 * `footnoteRefs` guard in `ask.mts` crashing on a null cache, and the attribution hasher
 * inflating every diverging count by 68 documents.
 *
 * So this runs each instrument and compares its headline number to a recorded one. It is a
 * DELIBERATE check rather than a per-commit gate: the compose axes each ask Obsidian, so the
 * full sweep is minutes, and an instrument that needs a missing prerequisite is SKIPPED rather
 * than failed -- a red line for "the referee corpus is not cloned" would train the reader to
 * ignore it.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface Instrument {
  readonly name: string;
  readonly argv: readonly string[];
  /** One capture group: the figure to compare. */
  readonly pattern: RegExp;
  /** What this instrument cannot run without. */
  readonly needs: "referee" | "obsidian" | "none";
}

const INSTRUMENTS: readonly Instrument[] = [
  {
    name: "referee footnotes",
    argv: ["test/parity/referee.mts"],
    pattern: /referee: (\d+)\/\d+ agree/u,
    needs: "referee",
  },
  {
    name: "referee code",
    argv: ["test/parity/referee.mts"],
    pattern: /(\d+)\/883 agree/u,
    needs: "referee",
  },
  {
    name: "mechanism diverging",
    argv: ["test/parity/mechanism.mts"],
    pattern: /(\d+) diverging/u,
    needs: "referee",
  },
  {
    name: "compose pairs",
    argv: ["test/parity/compose.mts"],
    pattern: /(\d+) of 256 diverge/u,
    needs: "obsidian",
  },
  {
    name: "compose matrix",
    argv: ["test/parity/compose.mts", "--matrix"],
    pattern: /(\d+) of 80 diverge/u,
    needs: "obsidian",
  },
  {
    name: "compose inside",
    argv: ["test/parity/compose.mts", "--inside"],
    pattern: /(\d+) of 64 diverge/u,
    needs: "obsidian",
  },
  {
    name: "compose inline",
    argv: ["test/parity/compose.mts", "--inline"],
    pattern: /(\d+) of 196 diverge/u,
    needs: "obsidian",
  },
  {
    name: "compose isolate",
    argv: ["test/parity/compose.mts", "--isolate"],
    pattern: /(\d+) of 140 diverge/u,
    needs: "obsidian",
  },
  {
    name: "compose nested",
    argv: ["test/parity/compose.mts", "--nested"],
    pattern: /(\d+) of 192 diverge/u,
    needs: "obsidian",
  },
  {
    name: "compose inline-block",
    argv: ["test/parity/compose.mts", "--inline-block"],
    pattern: /(\d+) of 224 diverge/u,
    needs: "obsidian",
  },
];

const BASELINE = path.join(import.meta.dirname, "goldens/instruments.json");
const recorded: Record<string, string> = fs.existsSync(BASELINE)
  ? (JSON.parse(fs.readFileSync(BASELINE, "utf8")) as Record<string, string>)
  : {};

const hasReferee =
  process.env.PARITY_REFEREE_DIR !== undefined &&
  fs.existsSync(process.env.PARITY_REFEREE_DIR);
const hasObsidian = (() => {
  try {
    execFileSync("obsidian", ["version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 60_000,
    });
    return true;
  } catch {
    return false;
  }
})();

/** Each instrument is run ONCE even when two figures are read from it. */
const output = new Map<string, string>();
function run(argv: readonly string[]): string {
  const key = argv.join(" ");
  const cached = output.get(key);
  if (cached !== undefined) return cached;
  let text: string;
  try {
    text = execFileSync("npx", ["tsx", "--conditions=development", ...argv], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 2_400_000,
    });
  } catch (error) {
    // A THROWN instrument is the failure this exists for, so its output is kept rather than
    // rethrown: `compose.mts` died with an empty stdout and a stack trace, which is exactly the
    // shape that went unnoticed.
    const shell = error as { stdout?: string; stderr?: string };
    text = `${shell.stdout ?? ""}\n${shell.stderr ?? ""}\nINSTRUMENT THREW`;
  }
  output.set(key, text);
  return text;
}

const wantRecord = process.argv.includes("--record");
const fresh: Record<string, string> = {};
let drifted = 0;
let skipped = 0;
let threw = 0;

console.log(
  "instruments: does each one still reproduce its recorded figure?\n",
);
for (const instrument of INSTRUMENTS) {
  const blocked =
    (instrument.needs === "referee" && !hasReferee) ||
    (instrument.needs === "obsidian" && !hasObsidian);
  if (blocked) {
    skipped += 1;
    console.log(
      `  SKIP  ${instrument.name.padEnd(22)} needs ${instrument.needs}`,
    );
    continue;
  }
  const text = run(instrument.argv);
  if (text.includes("INSTRUMENT THREW")) {
    threw += 1;
    console.log(
      `  THREW ${instrument.name.padEnd(22)} the tool itself failed to run`,
    );
    continue;
  }
  const hit = instrument.pattern.exec(text);
  if (!hit) {
    threw += 1;
    console.log(
      `  LOST  ${instrument.name.padEnd(22)} ran, but its figure no longer matches ${String(instrument.pattern)}`,
    );
    continue;
  }
  const now = hit[1]!;
  fresh[instrument.name] = now;
  const was = recorded[instrument.name];
  if (was === undefined) {
    console.log(`  NEW   ${instrument.name.padEnd(22)} ${now}`);
  } else if (was === now) {
    console.log(`  ok    ${instrument.name.padEnd(22)} ${now}`);
  } else {
    drifted += 1;
    console.log(`  DRIFT ${instrument.name.padEnd(22)} ${was} -> ${now}`);
  }
}

console.log(
  `\n  ${Object.keys(fresh).length} checked, ${drifted} drifted, ${threw} unusable, ${skipped} skipped`,
);
if (wantRecord) {
  fs.writeFileSync(
    BASELINE,
    `${JSON.stringify({ ...recorded, ...fresh }, null, 2)}\n`,
  );
  console.log("  recorded as the new baseline");
} else if (drifted > 0 || threw > 0) {
  console.log("  re-run with --record once each change is understood");
  process.exit(1);
}
