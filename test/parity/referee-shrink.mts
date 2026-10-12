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

import { refereeFacts } from "./referee-facts.js";

import type { Def, Ref } from "./referee-facts.js";

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
