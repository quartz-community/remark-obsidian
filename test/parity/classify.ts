/**
 * Shared primitives for corpus classification, with the guards that past measurements needed.
 *
 * Every export here exists because a hand-rolled version of it produced a WRONG NUMBER that work
 * was then aimed at. The guards are the point: a classifier that cannot answer should throw, not
 * return a plausible figure. Each one names the failure it prevents, so that removing it is a
 * deliberate act rather than a cleanup.
 *
 * Route new scratch classifiers through this module instead of re-reading the corpus directory.
 * Before this existed, 10 instruments re-implemented corpus loading and 6 re-implemented position
 * matching, which is why the same four mistakes kept recurring in different files.
 *
 * Run `tsx --conditions=development test/parity/classify.mts --self-test` to check the guards.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { refereeFacts, type Def, type Ref } from "./referee-facts.js";

export interface CorpusRow {
  /** The row's own id when it carries one, e.g. `broad:20261004-7392`. */
  readonly id: string;
  /** `file.json#index`, which is how `referee.mts` keys its output. BOTH are needed. */
  readonly positionalId: string;
  readonly text: string;
  readonly defs: readonly Def[];
  readonly refs: readonly Ref[];
}

export class ClassifierError extends Error {}

const INLINE_PREFIX = "[inline";

function isFactArray(value: unknown): value is unknown[][] {
  return Array.isArray(value) && value.every((entry) => Array.isArray(entry));
}

function readFacts(value: unknown): { defs: Def[]; refs: Ref[] } {
  const row = (value ?? {}) as Record<string, unknown>;
  const defs = isFactArray(row["defs"])
    ? (row["defs"] as unknown as Def[])
    : [];
  const refs = isFactArray(row["refs"])
    ? (row["refs"] as unknown as Ref[])
    : [];
  return { defs: real(defs), refs: real(refs) };
}

/**
 * Drops the `[inline…]` pseudo-facts the harness uses for its own bookkeeping.
 *
 * They are not footnote facts and counting them inflates every total. Applied on load so no
 * caller has to remember it.
 */
export function real<T extends Def | Ref>(facts: readonly T[]): T[] {
  return facts.filter((fact) => !String(fact[0]).startsWith(INLINE_PREFIX));
}

/**
 * Loads every recorded answer, carrying BOTH id schemes, and throws when the corpus is empty.
 *
 * Two failures are prevented here. `ablate.mts` once reported `0 diverging documents` because it
 * was handed ids in one scheme and keyed by the other -- an empty intersection that reads exactly
 * like a clean result. And a scratch classifier with an always-true guard passed `""` to the fact
 * extractor for every document and produced a confident zero that contradicted a committed
 * instrument. An empty or unreadable corpus is a broken harness, never a finding.
 */
export function loadCorpus(dir?: string): CorpusRow[] {
  const root =
    dir ??
    process.env["PARITY_REFEREE_DIR"] ??
    "/tmp/opencode/corrected-answers";
  if (!fs.existsSync(root)) {
    throw new ClassifierError(`corpus directory does not exist: ${root}`);
  }

  const rows: CorpusRow[] = [];
  for (const file of fs.readdirSync(root).sort()) {
    if (!file.endsWith(".json")) continue;
    const parsed: unknown = JSON.parse(
      fs.readFileSync(path.join(root, file), "utf8"),
    );
    const entries = Array.isArray(parsed) ? parsed : [];
    for (const [index, entry] of entries.entries()) {
      const record = (entry ?? {}) as Record<string, unknown>;
      const text = record["text"];
      if (typeof text !== "string" || text === "") continue;
      const { defs, refs } = readFacts(entry);
      rows.push({
        id:
          typeof record["id"] === "string" ? record["id"] : `${file}#${index}`,
        positionalId: `${file}#${index}`,
        text,
        defs,
        refs,
      });
    }
  }

  if (rows.length === 0) {
    throw new ClassifierError(
      `corpus at ${root} yielded 0 usable rows -- harness is broken, this is not a result`,
    );
  }
  return rows;
}

/** Our own parse of a row, with the pseudo-facts already dropped. */
export function ourFacts(text: string): { defs: Def[]; refs: Ref[] } {
  const facts = refereeFacts(text);
  return { defs: real(facts.defs), refs: real(facts.refs) };
}

/**
 * A fact's identity: name AND line AND column.
 *
 * Name-only comparison contaminated 12% of a 40-document classification and, worse, sent work
 * after a mechanism that did not exist -- it matched a definition on one line against a different
 * definition of the same name on another. There is deliberately no name-only comparator exported
 * from this module.
 */
export function posKey(fact: Def | Ref): string {
  return `${String(fact[0])}@${String(fact[1])}@${String(fact[2])}`;
}

/**
 * Finds the one fact at a position, and throws when the position is ambiguous.
 *
 * `.find()` silently returns the first of several matches. One corpus document emits the same
 * definition twice with different end lines, and a span comparison built on `.find()` read the
 * shorter one and reported a span defect that was really a duplicate-emission defect. If a
 * position is not unique the caller's model is wrong and it should stop.
 */
export function matchByPosition<T extends Def | Ref>(
  haystack: readonly T[],
  needle: Def | Ref,
): T | undefined {
  const key = posKey(needle);
  const hits = haystack.filter((fact) => posKey(fact) === key);
  if (hits.length > 1) {
    throw new ClassifierError(
      `position ${key} matched ${String(hits.length)} facts -- ambiguous, the model is wrong`,
    );
  }
  return hits[0];
}

export interface Population {
  readonly label: string;
  readonly members: readonly CorpusRow[];
  readonly total: number;
}

/**
 * Selects a sub-population and refuses both degenerate answers.
 *
 * Zero is the familiar one. The mirror case cost just as much: a strict-mode differential
 * reported that 652 of 652 documents diverged, which was one additive root field rather than 652
 * defects, and a figure like 610 of 652 would not have looked wrong at all. A predicate matching
 * everything is as uninformative as one matching nothing, so both throw.
 */
export function population(
  label: string,
  rows: readonly CorpusRow[],
  filter: (row: CorpusRow) => boolean,
): Population {
  if (rows.length === 0) {
    throw new ClassifierError(`${label}: given 0 rows to filter`);
  }
  const members = rows.filter((row) => filter(row));
  if (members.length === 0) {
    throw new ClassifierError(
      `${label}: predicate matched 0 of ${String(rows.length)} -- broken predicate, not a finding`,
    );
  }
  if (members.length === rows.length) {
    throw new ClassifierError(
      `${label}: predicate matched ALL ${String(rows.length)} -- uninformative, suspect a systematic difference`,
    );
  }
  return { label, members, total: rows.length };
}

export interface BucketRow {
  readonly label: string;
  readonly count: number;
  readonly rate: number;
  readonly controlRate: number;
  readonly lift: number;
  readonly noise: boolean;
}

/**
 * Minimum lift before a bucket is worth acting on.
 *
 * Calibrated against two recorded refusals. Labels inside `[[ ]]` went unindexed 52.4% of the
 * time against a 42.1% base rate -- lift 1.24, and it was noise. A composite fence predicate
 * reached 1.25 while matching half the corpus, also noise. Single input-shape constructs peaked
 * at 2.14 and list items sat at 1.13.
 */
export const NOISE_LIFT = 1.3;

/**
 * Classifies a population and prices every bucket against a control, because a bucket's size
 * says nothing on its own.
 *
 * A classifier can be trivially satisfied and look productive. One grouped 16 documents under
 * "another footnote definition" when the classified line WAS the definition -- guaranteed by
 * construction, lift 1.0, and an implementation was being drafted against it. Comparing to a
 * control turns that from something to notice into something printed as NOISE.
 */
export function bucket(
  pop: Population,
  control: readonly CorpusRow[],
  classify: (row: CorpusRow) => string | undefined,
): BucketRow[] {
  if (control.length === 0) {
    throw new ClassifierError(`${pop.label}: control population is empty`);
  }

  const tally = (rows: readonly CorpusRow[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const label = classify(row);
      if (label === undefined) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return counts;
  };

  const inPop = tally(pop.members);
  const inControl = tally(control);

  const out: BucketRow[] = [];
  for (const [label, count] of inPop) {
    const rate = count / pop.members.length;
    const controlRate = (inControl.get(label) ?? 0) / control.length;
    const lift =
      controlRate === 0 ? Number.POSITIVE_INFINITY : rate / controlRate;
    out.push({
      label,
      count,
      rate,
      controlRate,
      lift,
      noise: lift < NOISE_LIFT,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

export function formatBuckets(
  pop: Population,
  rows: readonly BucketRow[],
): string {
  const lines = [
    `  ${pop.label}: ${String(pop.members.length)} of ${String(pop.total)}`,
    "",
    "    count   rate  control   lift",
  ];
  for (const row of rows) {
    const lift = Number.isFinite(row.lift) ? row.lift.toFixed(2) : "inf";
    lines.push(
      `   ${String(row.count).padStart(6)}  ${(row.rate * 100).toFixed(1).padStart(5)}%  ${(row.controlRate * 100).toFixed(1).padStart(6)}%  ${lift.padStart(5)}` +
        `   ${row.label}${row.noise ? "   <- NOISE" : ""}`,
    );
  }
  return lines.join("\n");
}

/**
 * Samples on a stride, and it is the only sampler this module exports.
 *
 * Six separate times a family was misdescribed because the shortest or first few members were
 * inspected: the two shortest documents of a 66-document family selected for a shape covering at
 * most 30% of it. Length and position both correlate with structure, so neither can be the
 * selector. A rule re-learned six times belongs in code.
 */
export function strideSample<T>(items: readonly T[], count: number): T[] {
  if (count <= 0)
    throw new ClassifierError(`strideSample: count must be positive`);
  if (items.length === 0)
    throw new ClassifierError(`strideSample: nothing to sample`);
  if (count >= items.length) return [...items];
  const stride = items.length / count;
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const item = items[Math.floor(i * stride)];
    if (item !== undefined) out.push(item);
  }
  return out;
}

/**
 * Strips fields that differ on every document for reasons unrelated to parsing.
 *
 * `data.lineOffsets` is a legacy-parity side channel attached to every root, empty under the
 * strict preset. Comparing trees without removing it reports that 100% of documents differ, which
 * is a statement about whether the plugin ran rather than about how it parsed.
 */
export function normalizeTree(tree: unknown): unknown {
  if (tree === null || typeof tree !== "object") return tree;
  const clone = structuredClone(tree) as { data?: Record<string, unknown> };
  if (clone.data !== undefined) {
    const { lineOffsets: _lineOffsets, ...rest } = clone.data;
    if (Object.keys(rest).length === 0) delete clone.data;
    else clone.data = rest;
  }
  return clone;
}

/**
 * Guards a raw ratio that did not come from `population`.
 *
 * Differentials count outside the population helper, and that is exactly where 652 of 652 slipped
 * through. Both extremes throw for the same reason they do there.
 */
export function assertPlausible(
  observed: number,
  total: number,
  label: string,
): void {
  if (total === 0) throw new ClassifierError(`${label}: total is 0`);
  if (observed === 0) {
    throw new ClassifierError(
      `${label}: 0 of ${String(total)} -- suspect a broken comparison, not a clean result`,
    );
  }
  if (observed === total) {
    throw new ClassifierError(
      `${label}: ${String(total)} of ${String(total)} -- suspect a systematic difference, normalize first`,
    );
  }
}

function selfTest(): void {
  const results: string[] = [];
  const throws = (name: string, body: () => unknown): void => {
    try {
      body();
      results.push(`  FAIL  ${name}: expected a throw, got none`);
    } catch (error) {
      if (error instanceof ClassifierError) results.push(`  ok    ${name}`);
      else results.push(`  FAIL  ${name}: wrong error type ${String(error)}`);
    }
  };
  const eq = (name: string, actual: unknown, expected: unknown): void => {
    const a = JSON.stringify(actual),
      b = JSON.stringify(expected);
    results.push(
      a === b ? `  ok    ${name}` : `  FAIL  ${name}: ${a} !== ${b}`,
    );
  };

  const row = (id: string, text: string): CorpusRow => ({
    id,
    positionalId: `fixture.json#${id}`,
    text,
    defs: [],
    refs: [],
  });
  const rows = [
    row("a", "aaa"),
    row("b", "bb"),
    row("c", "c"),
    row("d", "dddd"),
  ];

  throws("loadCorpus rejects a missing directory", () =>
    loadCorpus("/nonexistent-corpus-path-for-self-test"),
  );
  throws("loadCorpus rejects an empty directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "classify-"));
    try {
      return loadCorpus(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  throws("population rejects a predicate matching none", () =>
    population("none", rows, () => false),
  );
  throws("population rejects a predicate matching all", () =>
    population("all", rows, () => true),
  );
  throws("matchByPosition rejects an ambiguous position", () =>
    matchByPosition([["x", 1, 0] as Ref, ["x", 1, 0] as Ref], [
      "x",
      1,
      0,
    ] as Ref),
  );
  throws("assertPlausible rejects 0 of n", () => {
    assertPlausible(0, 652, "zero");
  });
  throws("assertPlausible rejects n of n", () => {
    assertPlausible(652, 652, "all");
  });
  throws("strideSample rejects an empty input", () => strideSample([], 3));

  eq(
    "matchByPosition finds a unique fact",
    matchByPosition([["x", 1, 0] as Ref, ["y", 2, 0] as Ref], [
      "y",
      2,
      0,
    ] as Ref),
    ["y", 2, 0],
  );
  eq(
    "real() drops inline pseudo-facts",
    real([["[inline-x", 0, 0] as Ref, ["k", 1, 2] as Ref]),
    [["k", 1, 2]],
  );
  eq(
    "strideSample spreads rather than taking a prefix",
    strideSample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 3),
    [0, 3, 6],
  );
  eq(
    "normalizeTree removes an empty data.lineOffsets",
    normalizeTree({ type: "root", data: { lineOffsets: {} } }),
    { type: "root" },
  );
  eq(
    "normalizeTree keeps other data",
    normalizeTree({ type: "root", data: { lineOffsets: {}, keep: 1 } }),
    { type: "root", data: { keep: 1 } },
  );

  const pop = population("long", rows, (r) => r.text.length >= 2);
  const tautological = bucket(pop, rows, () => "always");
  eq(
    "a tautological classifier is flagged NOISE",
    tautological[0]?.noise,
    true,
  );
  const real_ = bucket(pop, rows, (r) =>
    r.text.length >= 4 ? "four-plus" : undefined,
  );
  eq("a discriminating classifier is not flagged", real_[0]?.noise, false);

  console.log(results.join("\n"));
  const failed = results.filter((line) => line.startsWith("  FAIL")).length;
  console.log(
    `\n  ${String(results.length - failed)} passed, ${String(failed)} failed`,
  );
  if (failed > 0) process.exit(1);
}

if (process.argv.includes("--self-test")) selfTest();
