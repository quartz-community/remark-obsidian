/**
 * Reduce the referee's disagreements to minimal forms, for promotion into the corpus.
 *
 * The referee stores only `text`, `defs` and `refs`, so it cannot adjudicate any rule whose
 * premise is structural -- four of its five remaining buckets need the containing block, and
 * each has a recorded refutation in `README.md` for exactly that reason. The way past that
 * is not a better predicate over its data; it is to move the case to the oracle that CAN
 * adjudicate it, where a document is small enough that one case is one cause.
 *
 * This finds what to move. For each disagreeing note it deletes lines greedily, re-basing
 * the recorded answer after each deletion, and keeps a deletion only while the disagreement
 * survives. What comes out is the shortest document that still disagrees.
 *
 *     PARITY_REFEREE_DIR=/tmp/of/test/obsidian-answers \
 *       npx tsx --conditions=development test/parity/referee-shrink.mts [limit]
 *
 * **Re-basing is an approximation and the output is a LEAD, not an answer.** Dropping a line
 * shifts every later line in the answer, which is exact, but it can also change how Obsidian
 * would read the lines that remain -- which is the whole reason these documents are hard. So
 * a surviving disagreement may be an artifact of the reduction rather than a real one. Every
 * form this prints has to be recorded against the application as a probe before any rule is
 * read off it, the same standard a third-party implementation's tests get.
 *
 * A line INSIDE a recorded definition's span is never dropped, and the first version of this
 * tool was useless for want of that rule. A definition's answer carries `lastLine`, so
 * deleting its body leaves an extent that nothing in the shorter document can satisfy -- the
 * disagreement is then preserved by construction, every deletion looks productive, and the
 * shrink walks every note down to a single line. It reported 109 "minimal forms" of which
 * the top four were `[^ch2*]: def`, `[^3]: Text`, `[^note]: Definition` and a seven-space
 * `[^1]: def`, all of which this package already gets right. A reduction with a degenerate
 * attractor finds the attractor, so the fixed point has to be one the oracle can still
 * describe.
 *
 * Shortest-first, because minimality has been the one selector that keeps working here while
 * five counting selectors have died. A 14-character document can only be wrong about one
 * thing.
 *
 * Both this tool and `referee.mts` read our facts through `referee-facts.ts`. They were
 * separate copies for exactly one run, during which the commented-definition rule landed in
 * `referee.mts` alone and this tool spent a pass reducing notes against three-commit-old
 * behaviour -- its output still dominated by `%%` forms the rule had closed.
 */
import fs from "node:fs";
import path from "node:path";

import { refereeFacts, refereeFactsWithTree } from "./referee-facts.js";
import { ask } from "./probe-channel.js";

import type { Answer } from "./probe-channel.js";
import type { Def, Facts, Ref } from "./referee-facts.js";

/**
 * What the disagreement is, in a form that SURVIVES DELETING A LINE.
 *
 * The offline shrink re-bases the recorded answer, which its own docstring calls an
 * approximation producing a lead rather than an answer. Asking Obsidian about the reduced
 * document instead removes the approximation -- and replaces one problem with another, because
 * a live answer's LINE NUMBERS move when a line is dropped, so the exact missing/extra sets the
 * offline signature compares cannot be compared across a reduction.
 *
 * The way through is that deleting a WHOLE LINE preserves columns. So this records, per name:
 * which names are missing, which are invented, whose COLUMN differs, and whose definition SPAN
 * (`end - start`, not `end`) differs. Every one of those is stable under dropping a line
 * elsewhere, and together they cover the three divergence kinds the direction screen measured
 * -- counts in either direction, and the 114 documents whose counts already match and whose
 * positions do not.
 *
 * A name-only signature would have been simpler and WRONG: those 114 documents reduce to "no
 * disagreement", so the shrink would delete their whole content and report a minimal form that
 * agrees. That is the degenerate attractor the offline tool already hit once from the other
 * direction.
 */
function liveSignature(text: string, obs: Answer): string {
  // REFS ARE DROPPED when the augmentation did not take, which is not a detail.
  //
  // `footnoteRefs` is definition-gated, so references are read from a copy carrying one
  // synthesised definition per name -- and a document that SWALLOWS its tail eats them. An
  // unclosed fence, an unclosed `%%` and an unclosed `$$` all do. The channel already detects
  // it and this function ignored the flag, so a ref-only divergence that is really "the probe
  // never fired" read as a real one and the shrink minimised toward it.
  //
  // Measured on the `ref-extra` run: 28 of 115 reported minimal forms are this artifact, and
  // the shortest is `hidden[^2]` over an unclosed fence -- where the appended definition lands
  // INSIDE the fence. Comparing definitions only is the honest fallback: a document whose refs
  // cannot be adjudicated is skipped rather than reduced toward a phantom.
  const refs = obs.refsTrustworthy ? obs.refs : [];
  let mine: Facts;
  let mineCode: number;
  try {
    const got = refereeFactsWithTree(text);
    mine = got;
    mineCode = got.tree.children.filter(
      (child) => child.type === "code",
    ).length;
  } catch {
    return "threw";
  }
  const key = (name: string) => name.toLowerCase();
  const mineDefs = new Map(mine.defs.map((d) => [key(d[0]), d]));
  const obsDefs = new Map(obs.defs.map((d) => [key(d[0]), d]));
  const mineRefs = new Map(mine.refs.map((r) => [key(r[0]), r]));
  const obsRefs = new Map(refs.map((r) => [key(r[0]), r]));

  const only = (a: Map<string, unknown>, b: Map<string, unknown>) =>
    [...a.keys()].filter((name) => !b.has(name)).sort();

  const colDiff: string[] = [];
  const spanDiff: string[] = [];
  for (const [name, def] of mineDefs) {
    const theirs = obsDefs.get(name);
    if (!theirs) continue;
    if (def[2] !== theirs[2]) colDiff.push(`d${name}`);
    if (def[3] - def[1] !== theirs[3] - theirs[1]) spanDiff.push(`d${name}`);
  }
  for (const [name, ref] of mineRefs) {
    const theirs = obsRefs.get(name);
    if (theirs && ref[2] !== theirs[2]) colDiff.push(`r${name}`);
  }

  return JSON.stringify({
    defsMissing: only(obsDefs, mineDefs),
    defsExtra: only(mineDefs, obsDefs),
    refsMissing: obs.refsTrustworthy ? only(obsRefs, mineRefs) : [],
    refsExtra: obs.refsTrustworthy ? only(mineRefs, obsRefs) : [],
    colDiff: colDiff.sort(),
    spanDiff: spanDiff.sort(),
    // THE DELTA, not the ranges. A code range is an absolute line number, so carrying the
    // ranges themselves would break the position-independence the rest of this signature is
    // built on -- dropping any line above a code block shifts it and the shrink would read
    // a preserved divergence as a changed one.
    //
    // The delta survives that, and it survives the shrink deleting a code block BOTH sides
    // agree on, which a raw count does not. It is what the 43-document bucket needs: they
    // report a root code block where we report none.
    codeDelta: mineCode - obs.code.length,
  });
}

const AGREES = JSON.stringify({
  defsMissing: [],
  defsExtra: [],
  refsMissing: [],
  refsExtra: [],
  colDiff: [],
  spanDiff: [],
  codeDelta: 0,
});

/**
 * Minimise against the LIVE application, one batch per round rather than one call per line.
 *
 * A greedy shrink needs one answer per candidate deletion, which is why doing this through
 * `obsidian eval` was never attempted: a 30-line document is 30 sequential round trips. The
 * file channel has no batch ceiling, so every single-line deletion for a round goes in ONE
 * request, and the only sequential part is the combination check -- `n` answers for the price
 * of one trip, then `O(log n)` trips to find a subset that can be dropped together.
 *
 * The combination check is what makes it a reduction rather than a survey. Lines that are
 * individually droppable are frequently not JOINTLY droppable: drop the quote marker and the
 * continuation line separately and either alone preserves the bug, together they delete it. So
 * the round proposes all of them, and on refusal splits the proposal in half and recurses,
 * which is `ddmin` with the per-unit tests batched.
 */
async function live(entries: readonly Entry[]): Promise<void> {
  const limitAt = process.argv.indexOf("--limit");
  const cap = limitAt === -1 ? 400 : Number(process.argv[limitAt + 1] ?? "400");
  const idsAt = process.argv.indexOf("--ids");
  const wanted =
    idsAt === -1
      ? undefined
      : new Set(
          fs
            .readFileSync(process.argv[idsAt + 1] ?? "", "utf8")
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line !== ""),
        );

  const pool = entries
    .map((entry, at) => ({ entry, key: entry.id ?? String(at) }))
    .filter(({ key }) => wanted === undefined || wanted.has(key))
    .filter(({ entry }) => entry.text.trim() !== "")
    .slice(0, cap);

  console.log(`referee-shrink --live: ${pool.length} documents`);
  let trips = 0;
  const askBatch = async (texts: readonly string[]): Promise<Answer[]> => {
    trips += 1;
    return ask(texts);
  };

  const forms = new Map<string, { count: number; from: string[] }>();
  let reduced = 0;
  let agreeing = 0;
  let untrusted = 0;

  /**
   * Resumable, because an unattended run that loses everything is not a run.
   *
   * This sweep is hours long and every answer in it costs a round trip to another process. A
   * crash at hour four with no partial output is a total loss, and the failure modes here are
   * measured rather than theoretical: the metadata worker wedges silently, and the app being
   * asked is someone else's running application.
   *
   * So each document is APPENDED as it finishes, and already-finished ids are skipped on
   * start. Relaunching the same command continues where it stopped; deleting the ledger starts
   * over.
   */
  const LEDGER = "/tmp/live-shrink.jsonl";
  const done = new Map<string, string>();
  if (fs.existsSync(LEDGER)) {
    for (const line of fs.readFileSync(LEDGER, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      try {
        const row = JSON.parse(line) as { key: string; text: string };
        done.set(row.key, row.text);
      } catch {
        /* a half-written final line after an interrupted run */
      }
    }
    console.log(`  resuming: ${done.size} documents already in ${LEDGER}`);
  }

  const remember = (text: string, key: string): void => {
    const seen = forms.get(text);
    if (seen) {
      seen.count += 1;
      if (seen.from.length < 6) seen.from.push(key);
    } else forms.set(text, { count: 1, from: [key] });
  };
  const record = (key: string, text: string, kind: string): void => {
    fs.appendFileSync(LEDGER, `${JSON.stringify({ key, text, kind })}\n`);
  };

  let seenCount = 0;
  const started = Date.now();
  for (const { entry, key } of pool) {
    seenCount += 1;
    const already = done.get(key);
    if (already !== undefined) {
      if (already === "") agreeing += 1;
      else remember(already, key);
      continue;
    }
    if (seenCount % 10 === 0 || seenCount === pool.length) {
      const mins = (Date.now() - started) / 60_000;
      console.log(
        `  ${seenCount}/${pool.length}  forms=${forms.size}  agree=${agreeing}  ` +
          `trips=${trips}  ${mins.toFixed(1)}m`,
      );
    }
    const [first] = await askBatch([entry.text]);
    if (!first) continue;
    if (!first.refsTrustworthy) untrusted += 1;
    const want = liveSignature(entry.text, first);
    // A document live Obsidian AGREES with is not a reduction target. The referee's recorded
    // answer can differ from the running app -- that is what `release-diff.mts` exists to
    // measure -- and shrinking toward a disagreement the application does not have would
    // manufacture a probe for a rule that is not there.
    if (want === AGREES || want === "threw") {
      agreeing += 1;
      record(key, "", want === "threw" ? "threw" : "agrees");
      continue;
    }

    let lines = entry.text.split("\n");
    for (let round = 0; round < 12; round++) {
      if (lines.length <= 1) break;
      const candidates = lines.map((_, at) => at);

      const without = (drop: ReadonlySet<number>) =>
        lines.filter((_, at) => !drop.has(at)).join("\n");
      const probes = candidates.map((at) => without(new Set([at])));
      const answers = await askBatch(probes);
      const droppable = candidates.filter(
        (at, index) =>
          answers[index] !== undefined &&
          liveSignature(probes[index]!, answers[index]!) === want,
      );
      if (droppable.length === 0) break;

      const keep = await jointly(droppable, want, without, askBatch);
      if (keep.length === 0) break;
      const drop = new Set(keep);
      lines = lines.filter((_, at) => !drop.has(at));
    }

    lines = await trimTails(lines, want, askBatch);

    const text = lines.join("\n");
    if (text.length < entry.text.length) reduced += 1;
    remember(text, key);
    record(key, text, "reduced");
  }

  const sorted = [...forms.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[0].length - b[0].length,
  );
  console.log(
    `  reduced ${reduced}; ${sorted.length} distinct minimal forms; ` +
      // "SKIPPED", not "agree". This counter incremented for any document the loop declined,
      // which includes those whose refs cannot be adjudicated because the augmentation was
      // swallowed -- so it read 34% on `ref-extra` and 0% on `def-miss @ code` and was taken
      // twice as evidence that the referee corpus had gone stale. Asking the live application
      // about all 967 diverging documents put the real staleness at FOURTEEN.
      `${agreeing} SKIPPED (agree with live, or refs not adjudicable); ` +
      `${untrusted} of those have untrustworthy refs`,
  );

  // EVERY form re-asked, because the whole point of this mode is that a reported form is an
  // answer rather than a lead -- and the offline tool's documented failure was reporting 109
  // "minimal forms" whose top four this package already got right. A form that agrees is a
  // reduction that walked off the bug, and it must be loud rather than printed in a table.
  const verdicts = await askBatch(sorted.map(([text]) => text));
  const degenerate = sorted.filter(
    ([text], at) =>
      verdicts[at] === undefined ||
      liveSignature(text, verdicts[at]!) === AGREES,
  );
  console.log(
    degenerate.length === 0
      ? `  VERIFIED: all ${sorted.length} forms still disagree with live Obsidian`
      : `  BROKEN: ${degenerate.length} of ${sorted.length} forms AGREE -- the reduction walked off the bug`,
  );
  for (const [text] of degenerate.slice(0, 5)) {
    console.log(`    degenerate: ${JSON.stringify(text)}`);
  }
  console.log(`  ${trips} channel round trips`);
  console.log("  forms, commonest first:\n");
  for (const [text, { count, from }] of sorted.slice(0, 40)) {
    console.log(
      `  ${String(count).padStart(3)}x  ${JSON.stringify(text)}  [${from.slice(0, 3).join(" ")}]`,
    );
  }
  fs.writeFileSync(
    "/tmp/live-shrink.json",
    JSON.stringify(
      sorted.map(([text, { count, from }]) => ({ text, count, from })),
      null,
      2,
    ),
  );
  console.log("\n  full list: /tmp/live-shrink.json");
}

/**
 * Shrink each line by dropping words from its END, which is the only within-line cut this
 * signature can take.
 *
 * Line-granular reduction leaves a fuzz document's real bulk untouched: one form came out of
 * the line phase carrying a single 500-character line, which is unreadable as a probe and
 * clusters with nothing. Cutting WITHIN a line normally invalidates the comparison, because
 * `liveSignature` tracks which names sit at a differing COLUMN and an interior cut moves every
 * column after it. A TRAILING cut does not: everything that remains keeps the column it had.
 *
 * Halving rather than one word at a time, and one batch per round across ALL lines, so an
 * eighty-word line costs about seven round trips instead of eighty. Each round proposes
 * truncating every line to half its remaining words, keeps the proposals that hold, and
 * repeats; the single-word pass at the end recovers the boundary the halving overshoots.
 */
async function trimTails(
  start: readonly string[],
  want: string,
  askBatch: (texts: readonly string[]) => Promise<Answer[]>,
): Promise<string[]> {
  let lines = [...start];
  const words = (line: string) => line.split(/(?<=\s)/u);

  for (const share of [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.9, 0.9, 0.9]) {
    const proposals: { at: number; text: string; line: string }[] = [];
    for (let at = 0; at < lines.length; at++) {
      const parts = words(lines[at]!);
      if (parts.length < 2) continue;
      const keepCount = Math.max(1, Math.floor(parts.length * share));
      if (keepCount >= parts.length) continue;
      const shorter = parts.slice(0, keepCount).join("").replace(/\s+$/u, "");
      if (shorter === lines[at]) continue;
      const candidate = [...lines];
      candidate[at] = shorter;
      proposals.push({ at, text: candidate.join("\n"), line: shorter });
    }
    if (proposals.length === 0) continue;
    const answers = await askBatch(proposals.map((p) => p.text));
    // Applied ONE AT A TIME rather than all at once: two independent truncations can each hold
    // and together delete the construct, the same trap the line phase handles by halving. A
    // round is cheap enough that taking the first winner per line and re-proposing is simpler
    // than a joint check here.
    let changed = false;
    for (let index = 0; index < proposals.length; index++) {
      const answer = answers[index];
      const proposal = proposals[index]!;
      if (!answer || liveSignature(proposal.text, answer) !== want) continue;
      const trial = [...lines];
      trial[proposal.at] = proposal.line;
      const [check] = await askBatch([trial.join("\n")]);
      if (!check || liveSignature(trial.join("\n"), check) !== want) continue;
      lines = trial;
      changed = true;
    }
    if (!changed && share === 0.9) break;
  }
  return lines;
}

/**
 * The largest subset of `droppable` that can be removed TOGETHER, by halving.
 *
 * Returns the lines to drop, which is empty when even a single one cannot go -- the caller
 * stops there. Each level costs one round trip for the whole proposal, then two for its halves,
 * so a round converges in `O(log n)` trips rather than `n`.
 */
async function jointly(
  droppable: readonly number[],
  want: string,
  without: (drop: ReadonlySet<number>) => string,
  askBatch: (texts: readonly string[]) => Promise<Answer[]>,
): Promise<number[]> {
  if (droppable.length === 0) return [];
  const text = without(new Set(droppable));
  const [answer] = await askBatch([text]);
  if (answer && liveSignature(text, answer) === want) return [...droppable];
  if (droppable.length === 1) return [];
  const middle = Math.floor(droppable.length / 2);
  const left = await jointly(
    droppable.slice(0, middle),
    want,
    without,
    askBatch,
  );
  const right = await jointly(droppable.slice(middle), want, without, askBatch);
  const both = [...left, ...right];
  if (both.length === 0 || left.length === 0 || right.length === 0) return both;
  const together = without(new Set(both));
  const [check] = await askBatch([together]);
  return check && liveSignature(together, check) === want ? both : left;
}

interface Entry {
  readonly id?: string;
  readonly text: string;
  readonly defs: readonly Def[];
  readonly refs: readonly Ref[];
}

const dir =
  process.env.PARITY_REFEREE_DIR ??
  "/tmp/obsidian-footnotes/test/obsidian-answers";
const limit = Number(process.argv[2] ?? "300");

if (!fs.existsSync(dir)) {
  console.log(`referee-shrink: no corpus at ${dir}`);
  process.exit(0);
}

const key = (rows: readonly (readonly unknown[])[]) =>
  JSON.stringify(rows.map((row) => JSON.stringify(row)).sort());

/**
 * What the disagreement IS, not merely that there is one.
 *
 * Preserving "still disagrees" is not enough and the second version of this tool failed on
 * exactly that. `> %%` over `[^3]: Text` is a note where Obsidian reports no definition and
 * a REFERENCE at the label, because the quoted `%%` runs to the end of the note and the
 * failed definition's name is still indexed. Delete the `> %%` and the remainder still
 * disagrees -- but now because we report a definition Obsidian would also report, against a
 * re-based answer that no longer describes anything. The shrink happily took that step and
 * printed `[^3]: Text` as a minimal form of a rule about comments.
 *
 * So the invariant is the signature: every answer entry we MISS has to stay missed, and no
 * entry we do not report may appear. A deletion that trades one defect for another is not a
 * reduction of the first.
 */
function signature(text: string, defs: readonly Def[], refs: readonly Ref[]) {
  let mine;
  try {
    mine = refereeFacts(text);
  } catch {
    return "threw";
  }
  const have = new Set([
    ...mine.defs.map((d) => "d" + JSON.stringify(d)),
    ...mine.refs.map((r) => "r" + JSON.stringify(r)),
  ]);
  const want = new Set([
    ...defs.map((d) => "d" + JSON.stringify(d)),
    ...refs.map((r) => "r" + JSON.stringify(r)),
  ]);
  const missing = [...want].filter((x) => !have.has(x)).sort();
  const extra = [...have].filter((x) => !want.has(x)).sort();
  return JSON.stringify({ missing, extra });
}

function disagrees(text: string, defs: readonly Def[], refs: readonly Ref[]) {
  let mine;
  try {
    mine = refereeFacts(text);
  } catch {
    return true;
  }
  return key(mine.defs) !== key(defs) || key(mine.refs) !== key(refs);
}

/** Drop a line from an answer: entries on it go, entries after it move up one. */
function rebase(
  defs: readonly Def[],
  refs: readonly Ref[],
  line: number,
): { defs: Def[]; refs: Ref[] } {
  const shift = (n: number) => (n > line ? n - 1 : n);
  return {
    defs: defs
      .filter((d) => d[1] !== line)
      .map((d): Def => [d[0], shift(d[1]), d[2], shift(d[3])]),
    refs: refs
      .filter((r) => r[1] !== line)
      .map((r): Ref => [r[0], shift(r[1]), r[2]]),
  };
}

const entries: Entry[] = [];
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const raw: unknown = JSON.parse(
    fs.readFileSync(path.join(dir, file), "utf8"),
  );
  const list = Array.isArray(raw)
    ? raw
    : Object.values(raw as Record<string, unknown>);
  for (const value of list as Entry[]) entries.push(value);
}

/**
 * Cluster the last run's minimal forms by the SET of constructs each carries.
 *
 *     npx tsx --conditions=development test/parity/referee-shrink.mts --interactions
 *
 * WHY A SET AND NOT A LABEL. Divergence tracks DENSITY, not any construct: a document carrying
 * seven or more distinct constructs diverges 46% of the time against a 14.2% base, which is
 * lift 3.24, where the strongest single construct manages 1.60. So what remains is
 * interactions -- and **78% of minimal forms carry two or more constructs**.
 *
 * Every cluster table produced before this was ad-hoc, tagging a form by its FIRST matching
 * construct, so `> ``` ` over an unquoted line counted as "fence" and `quote + comment + tab`
 * counted as "quote". That collapses the interaction into whichever construct the tagger
 * happened to test first, which is the one thing the evidence says must be kept.
 *
 * It is deliberately a SOURCE-construct set, not a node-type set. `mechanism.mts` already
 * classifies by which of OUR nodes covers the diverging position, and that axis answers "what
 * did we build"; this one answers "what did the author write that we could not combine".
 */
const CONSTRUCTS: readonly (readonly [string, RegExp])[] = [
  ["quote", /^[ \t]*>/mu],
  ["fence", /```|~~~/u],
  ["math", /\$/u],
  ["comment", /%%/u],
  ["tab", /\t/u],
  ["marker", /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]/mu],
  ["wikilink", /\[\[/u],
  ["inline-fn", /\^\[/u],
  ["table", /\|/u],
  ["html", /<[a-z/]/u],
  ["indent4", /^ {4,}/mu],
];

if (process.argv.includes("--interactions")) {
  const forms = JSON.parse(
    fs.readFileSync("/tmp/live-shrink.json", "utf8"),
  ) as { text: string; count: number }[];
  const setOf = (text: string): string[] =>
    CONSTRUCTS.filter(([, pattern]) => pattern.test(text)).map(
      ([name]) => name,
    );

  const bySize = new Map<number, number>();
  const bySet = new Map<string, { forms: number; docs: number }>();
  for (const form of forms) {
    const set = setOf(form.text);
    bySize.set(set.length, (bySize.get(set.length) ?? 0) + 1);
    const key = set.join(" + ") || "(none)";
    const seen = bySet.get(key) ?? { forms: 0, docs: 0 };
    seen.forms += 1;
    seen.docs += form.count;
    bySet.set(key, seen);
  }
  console.log(`interactions: ${forms.length} minimal forms`);
  console.log("\n  how many constructs each carries:");
  let multi = 0;
  for (const size of [...bySize.keys()].sort((a, b) => a - b)) {
    const n = bySize.get(size)!;
    if (size >= 2) multi += n;
    console.log(`    ${size} construct(s) : ${String(n).padStart(3)} forms`);
  }
  console.log(
    `    -> ${multi} of ${forms.length} (${Math.round((100 * multi) / forms.length)}%) carry TWO OR MORE`,
  );
  console.log("\n  by construct SET, commonest first:");
  for (const [key, seen] of [...bySet].sort((a, b) => b[1].docs - a[1].docs)) {
    if (seen.docs < 2) continue;
    console.log(
      `    ${String(seen.docs).padStart(3)} docs  ${String(seen.forms).padStart(3)} forms   ${key}`,
    );
  }
  process.exit(0);
}

if (process.argv.includes("--live")) {
  await live(entries);
  process.exit(0);
}

const failing = entries
  .filter((e) => disagrees(e.text, e.defs, e.refs))
  .sort((a, b) => a.text.split("\n").length - b.text.split("\n").length)
  .slice(0, limit);

console.log(
  `referee-shrink: ${failing.length} shortest disagreeing notes of ${entries.length}`,
);

const shapes = new Map<string, { count: number; text: string }>();
let reduced = 0;

for (const entry of failing) {
  let lines = entry.text.split("\n");
  let { defs, refs } = { defs: [...entry.defs], refs: [...entry.refs] };
  const want = signature(entry.text, defs, refs);

  // One greedy pass from the end, so an index stays valid after a deletion.
  for (let line = lines.length - 1; line >= 0; line--) {
    // Never inside a definition's recorded span: deleting its body makes `lastLine`
    // unsatisfiable and the disagreement survives for free. See the note above.
    if (defs.some((d) => line >= d[1] && line <= d[3])) continue;
    if (refs.some((r) => r[1] === line)) continue;
    const kept = [...lines.slice(0, line), ...lines.slice(line + 1)];
    if (kept.length === 0) continue;
    const next = rebase(defs, refs, line);
    const text = kept.join("\n");
    if (!disagrees(text, next.defs, next.refs)) continue;
    // ...and it has to be the SAME disagreement. See `signature`.
    if (signature(text, next.defs, next.refs) !== want) continue;
    lines = kept;
    defs = next.defs;
    refs = next.refs;
  }

  const text = lines.join("\n");
  if (text.length < entry.text.length) reduced++;
  const existing = shapes.get(text);
  if (existing) existing.count++;
  else shapes.set(text, { count: 1, text });
}

const sorted = [...shapes.values()].sort(
  (a, b) => b.count - a.count || a.text.length - b.text.length,
);
console.log(
  `  reduced ${reduced} of them; ${sorted.length} distinct minimal forms`,
);
console.log("  top forms, shortest first within a count:\n");
for (const { count, text } of sorted.slice(0, 25)) {
  console.log(`  ${String(count).padStart(3)}x  ${JSON.stringify(text)}`);
}

// A long tail is fragmented by text and concentrated by SHAPE -- the lesson that retired
// exact-string dedup on the fuzz sweep applies here too, since 349 distinct forms from 400
// notes means the top-25 list describes almost nothing. These features are structural and
// overlapping on purpose: a form can be both tab-indented and marker-hosted.
const feature: Array<[string, (text: string) => boolean]> = [
  ["holds a tab", (t) => t.includes("\t")],
  ["holds a `%%`", (t) => t.includes("%%")],
  [
    "a list marker hosts the label",
    (t) => /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+.*\[\^/mu.test(t),
  ],
  ["a quote marker on some line", (t) => /^[ \t]*>/mu.test(t)],
  ["more than one line", (t) => t.includes("\n")],
  [
    "an indented continuation line",
    (t) =>
      t
        .split("\n")
        .slice(1)
        .some((l) => /^[ \t]+\S/u.test(l)),
  ],
  [
    "a second label on another line",
    (t) => t.split("\n").filter((l) => /\[\^[^\]]*\]:/u.test(l)).length > 1,
  ],
  [
    "a reference outside any label",
    (t) => t.split("\n").some((l) => /\[\^[^\]]*\](?!:)/u.test(l)),
  ],
  ["math `$`", (t) => t.includes("$")],
  ["a fence", (t) => /(?:```|~~~)/u.test(t)],
];
console.log(
  "\n  shape features over all " + sorted.length + " distinct forms:",
);
for (const [name, test] of feature) {
  const hits = sorted.filter((s) => test(s.text)).length;
  console.log(
    `  ${String(hits).padStart(4)}  ${((100 * hits) / sorted.length).toFixed(0).padStart(3)}%  ${name}`,
  );
}
