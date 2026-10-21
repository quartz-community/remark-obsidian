import fs from "node:fs";
import path from "node:path";

import { ask, type Answer } from "./probe-channel.js";

/**
 * Re-record the corpus's ANSWERS from the live application, with prefix augmentation.
 *
 * The recorded corpus is the gate's oracle, and its reference side is partly measuring the
 * recorder rather than Obsidian. Measured, not supposed: of sixty sampled `ref EXTRA / col0`
 * assertions -- the largest signature in the whole queue at 322 -- **38 were references LIVE
 * OBSIDIAN HAS and the corpus omits**, and only 22 were errors of ours. The rules document says
 * so in its own words: "in about 290 notes of each run the oracle could not ask whether some
 * reference is live... the comparison leaves those references out."
 *
 * The cause is augmentation. Reading `footnoteRefs` requires every name to be DEFINED, so the
 * recorder synthesises a definition per undefined name and appends it -- and a note that swallows
 * its tail (an unclosed `%%`, an unclosed fence) eats them, leaving no name defined and the
 * definition-gated field empty. That reads as "Obsidian indexes no reference here" when it means
 * "the probe never fired". This harness had the identical defect and fixed it by inserting the
 * synthesised definitions as a PREFIX, after any frontmatter block: 41 untrustworthy documents
 * out of 260 diverging went to 0, and out-of-range reference lines went 1 to 0.
 *
 * So the corpus can be re-recorded through the fixed path. References are 18,361 of the 23,618
 * assertions the gate scores -- 78% -- and until this runs that 78% carries unknown
 * contamination. As parity approaches, that noise stops being a nuisance and becomes the
 * dominant term: we would not be able to tell 98% from 99%.
 *
 * WHAT THIS DOES NOT DO. It does not touch the sibling project's corpus, which is theirs; it
 * writes a parallel directory and records `refsTrustworthy` per document so the referee can
 * EXCLUDE what still cannot be adjudicated rather than scoring it as agreement or as our error.
 * A reference nobody can read is not evidence in either direction.
 */
/**
 * `raw` carries the ENTIRE original record, not the four fields this tool reads.
 *
 * The corrected corpus has to be a drop-in replacement -- the referee reads it by pointing
 * `PARITY_REFEREE_DIR` at it and scores every dimension from the same rows. Rebuilding each row
 * from the typed fields silently dropped `code`, and the gate reported `0/0 agree (NaN%)` for
 * root code blocks: a whole dimension gone, announced only by a NaN that is easy to read past.
 * Spreading the original and overriding one key keeps every field this tool does not understand.
 */
interface Row {
  readonly id: string;
  readonly text: string;
  readonly defs?: unknown;
  readonly refs?: unknown;
  readonly raw: Record<string, unknown>;
}

interface Recorded {
  readonly id: string;
  readonly defs: readonly Answer["defs"][number][];
  readonly refs: readonly Answer["refs"][number][];
  readonly refsTrustworthy: boolean;
}

const DIR =
  process.env["PARITY_REFEREE_DIR"] ?? "/tmp/opencode/of/test/obsidian-answers";
const LEDGER = "/tmp/opencode/recorded-answers.jsonl";
const OUT = "/tmp/opencode/corrected-answers";

function load(): { file: string; rows: Row[] }[] {
  const out: { file: string; rows: Row[] }[] = [];
  for (const file of fs.readdirSync(DIR).sort()) {
    if (!file.endsWith(".json")) continue;
    const parsed: unknown = JSON.parse(
      fs.readFileSync(path.join(DIR, file), "utf8"),
    );
    const raw = Array.isArray(parsed) ? (parsed as Partial<Row>[]) : [];
    const rows: Row[] = [];
    for (const [index, row] of raw.entries()) {
      if (typeof row.text !== "string") continue;
      rows.push({
        id: row.id ?? `${file}#${index}`,
        text: row.text,
        defs: row.defs,
        refs: row.refs,
        raw: row as unknown as Record<string, unknown>,
      });
    }
    out.push({ file, rows });
  }
  return out;
}

/** Resume: whatever is already in the ledger is not asked again. */
function resume(): Map<string, Recorded> {
  const done = new Map<string, Recorded>();
  if (!fs.existsSync(LEDGER)) return done;
  for (const line of fs.readFileSync(LEDGER, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      const row = JSON.parse(line) as Recorded;
      done.set(row.id, row);
    } catch {
      // A torn final line from an interrupted run: drop it and re-ask that one.
    }
  }
  return done;
}

const batchAt = process.argv.indexOf("--batch");
const BATCH = batchAt === -1 ? 100 : Number(process.argv[batchAt + 1] ?? "100");
const limitAt = process.argv.indexOf("--limit");
const LIMIT =
  limitAt === -1 ? Infinity : Number(process.argv[limitAt + 1] ?? "0");

const files = load();
const done = resume();
const pending: Row[] = [];
for (const { rows } of files) {
  for (const row of rows) {
    if (row.text.trim() === "" || done.has(row.id)) continue;
    pending.push(row);
    if (pending.length >= LIMIT) break;
  }
  if (pending.length >= LIMIT) break;
}

console.log(
  `  corpus ${files.reduce((n, f) => n + f.rows.length, 0)} rows, ${done.size} already recorded, ${pending.length} to ask`,
);

const handle = fs.openSync(LEDGER, "a");
let asked = 0;
for (let at = 0; at < pending.length; at += BATCH) {
  const slice = pending.slice(at, at + BATCH);
  let answers: Answer[];
  try {
    answers = await ask(slice.map((row) => row.text));
  } catch (error) {
    console.log(
      `  batch at ${at} threw: ${(error as Error).message.slice(0, 80)}`,
    );
    continue;
  }
  for (const [index, row] of slice.entries()) {
    const answer = answers[index];
    if (!answer) continue;
    const recorded: Recorded = {
      id: row.id,
      defs: [...answer.defs],
      refs: [...answer.refs],
      refsTrustworthy: answer.refsTrustworthy,
    };
    fs.writeSync(handle, JSON.stringify(recorded) + "\n");
    done.set(row.id, recorded);
  }
  asked += slice.length;
  if (at % (BATCH * 10) === 0 || at + BATCH >= pending.length) {
    console.log(`    ${asked}/${pending.length} asked`);
  }
}
fs.closeSync(handle);

// Emit a corrected corpus mirroring the original's file layout, so the referee can read it with
// nothing but a different PARITY_REFEREE_DIR.
fs.mkdirSync(OUT, { recursive: true });
let changedRefs = 0;
let untrustworthy = 0;
let covered = 0;
for (const { file, rows } of files) {
  const out = rows.map((row) => {
    const fresh = done.get(row.id);
    if (!fresh) return row.raw;
    covered++;
    if (!fresh.refsTrustworthy) untrustworthy++;
    if (JSON.stringify(fresh.refs) !== JSON.stringify(row.refs ?? [])) {
      changedRefs++;
    }
    // DEFINITIONS ARE NOT ADOPTED, deliberately. `ask` augments the note with a synthesised
    // definition per undefined name so that the definition-gated `footnoteRefs` can be read, and
    // those synthetic entries come back in `defs` -- `[inline0`, `[inline1` and friends, 13 of
    // them in the first forty documents. Adopting them would corrupt the side of the oracle that
    // is already known good: definitions were checked three ways against live Obsidian across 67
    // documents with ZERO staleness. References are the contaminated half and the only half this
    // tool exists to repair. Measured on the same forty: 0 synthetic names reached `refs`.
    return {
      ...row.raw,
      refs: fresh.refs,
      refsTrustworthy: fresh.refsTrustworthy,
    };
  });
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(out));
}

console.log(`\n  corrected corpus -> ${OUT}`);
console.log(`    ${covered} documents re-recorded`);
console.log(
  `    ${changedRefs} have DIFFERENT references than the corpus recorded`,
);
console.log(
  `    ${untrustworthy} still cannot be adjudicated even with prefix augmentation`,
);
