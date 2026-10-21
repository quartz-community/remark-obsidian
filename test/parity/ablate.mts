import fs from "node:fs";
import path from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Root } from "mdast";

import remarkObsidian, { type RemarkObsidianFlags } from "../../src/index.js";
import { PROFILES, applyTextTransform } from "./chain.js";
import { factsOf } from "./referee-facts.js";

/**
 * WHICH PASS would have to change, for every document that diverges.
 *
 * The shrinker answers "what text diverges" and the signature classifier answers "what shape",
 * and both have now been measured to the end of their usefulness: forms are diffuse (687 distinct
 * reductions across 741 documents) while MECHANISMS are not (one rule closed 42 documents
 * spanning many forms). Nothing in the harness reported mechanisms, so every rule was chosen by
 * reading documents and guessing which pass owned them -- a guess that was wrong three times in
 * one session on a single family.
 *
 * This asks the question directly. For each diverging document, every flag is toggled in turn and
 * the document reparsed; a flag is CULPABLE when toggling it changes our answer, and DECISIVE
 * when toggling it makes the answer match the oracle. Decisive flags name a pass that is actively
 * wrong on that document. Culpable-but-not-decisive flags name a pass that participates.
 *
 * The projection comes from `factsOf`, the referee's own, rather than a local reimplementation --
 * the rule this harness learned when the shrinker spent a run scoring behaviour three commits
 * old.
 *
 * THE SOURCE IS PASSED TO `runSync`. Several transforms read the original text off the file, so a
 * processor run without it silently no-ops them and every ablation reads as "no change" -- which
 * is exactly how an earlier hand-rolled bisect concluded that no flag mattered. Any harness built
 * here must reproduce a KNOWN divergence before its zeros are believed, which `--self-test` does.
 */
interface Entry {
  readonly id: string;
  readonly text: string;
  readonly defs: unknown;
  readonly refs: unknown;
}

const BASE = PROFILES["all-features"].remarkObsidian as RemarkObsidianFlags &
  Record<string, unknown>;

/** Only booleans can be toggled; `preset` and any string option are structural, not passes. */
const FLAGS = Object.keys(BASE).filter(
  (key) => typeof BASE[key] === "boolean",
) as string[];

function parseWith(markdown: string, flags: Record<string, unknown>): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, flags as RemarkObsidianFlags)
    .use(remarkBreaks);
  const source = applyTextTransform(markdown);
  return processor.runSync(processor.parse(source), source) as Root;
}

function answerOf(markdown: string, flags: Record<string, unknown>): string {
  const source = applyTextTransform(markdown);
  const facts = factsOf(parseWith(markdown, flags), source);
  return JSON.stringify([facts.defs, facts.refs]);
}

function load(): Entry[] {
  const dir =
    process.env["PARITY_REFEREE_DIR"] ??
    "/tmp/opencode/of/test/obsidian-answers";
  const out: Entry[] = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith(".json")) continue;
    const parsed: unknown = JSON.parse(
      fs.readFileSync(path.join(dir, file), "utf8"),
    );
    const rows = Array.isArray(parsed) ? (parsed as Partial<Entry>[]) : [];
    for (const [index, row] of rows.entries()) {
      if (typeof row.text !== "string" || row.text === "") continue;
      out.push({
        id: row.id ?? `${file}#${index}`,
        text: row.text,
        defs: row.defs ?? [],
        refs: row.refs ?? [],
      });
    }
  }
  return out;
}

/**
 * Prove the harness can see a divergence it is known to cause before trusting any zero.
 *
 * `bareFootnoteRefs` destroys a footnote definition that a setext underline swallowed, measured
 * against live Obsidian. If this run reports that flag as not culpable, the harness is broken in
 * the way the earlier bisect was and every other reading is worthless.
 */
function selfTest(): boolean {
  const md = ">   [^1]: def\n>     -\n";
  const withFlag = answerOf(md, { ...BASE, bareFootnoteRefs: true });
  const without = answerOf(md, { ...BASE, bareFootnoteRefs: false });
  const ok = withFlag !== without;
  console.log(
    `  self-test  bareFootnoteRefs changes a known case : ${ok ? "YES" : "NO -- HARNESS IS BROKEN"}`,
  );
  return ok;
}

const limitAt = process.argv.indexOf("--limit");
const cap =
  limitAt === -1 ? Infinity : Number(process.argv[limitAt + 1] ?? "0");
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

if (!selfTest() && !process.argv.includes("--force")) {
  console.log(
    "  refusing to report ablations from a harness that cannot see a known change",
  );
  process.exit(1);
}
if (process.argv.includes("--self-test")) process.exit(0);

const entries = load();
const diverging: { entry: Entry; oracle: string }[] = [];
for (const entry of entries) {
  if (wanted && !wanted.has(entry.id)) continue;
  const oracle = JSON.stringify([entry.defs, entry.refs]);
  let ours: string;
  try {
    ours = answerOf(entry.text, BASE);
  } catch {
    continue;
  }
  if (ours !== oracle) diverging.push({ entry, oracle });
  if (diverging.length >= cap) break;
}

console.log(
  `\n  ${diverging.length} diverging documents, ${FLAGS.length} flags each\n`,
);

const decisive = new Map<string, string[]>();
const culpable = new Map<string, number>();
let noFlagMoves = 0;

for (const { entry, oracle } of diverging) {
  let moved = false;
  const base = answerOf(entry.text, BASE);
  for (const flag of FLAGS) {
    let got: string;
    try {
      got = answerOf(entry.text, { ...BASE, [flag]: !BASE[flag] });
    } catch {
      continue;
    }
    if (got === base) continue;
    moved = true;
    culpable.set(flag, (culpable.get(flag) ?? 0) + 1);
    if (got === oracle) {
      decisive.set(flag, [...(decisive.get(flag) ?? []), entry.id]);
    }
  }
  if (!moved) noFlagMoves++;
}

console.log("  DECISIVE -- toggling this flag makes the document AGREE:");
const byDecisive = [...decisive].sort((a, b) => b[1].length - a[1].length);
if (byDecisive.length === 0) console.log("    (none)");
for (const [flag, ids] of byDecisive) {
  console.log(
    `    ${String(ids.length).padStart(4)}  ${flag.padEnd(24)} e.g. ${ids.slice(0, 2).join(", ")}`,
  );
}

// `--emit <flag> <file>` writes that flag's decisive ids, which is what makes the loop
// mechanical: ablate to find the pass, emit its ids, shrink exactly those, count the reduction's
// mechanism in the unreduced corpus, then fix the scope. Every step before this one was done by
// hand-copying ids out of a terminal.
const emitAt = process.argv.indexOf("--emit");
if (emitAt !== -1) {
  const flag = process.argv[emitAt + 1] ?? "";
  const out = process.argv[emitAt + 2] ?? `/tmp/opencode/decisive-${flag}.txt`;
  const ids = decisive.get(flag) ?? [];
  fs.writeFileSync(out, ids.join("\n") + "\n");
  console.log(`\n  ${ids.length} ids decisive for \`${flag}\` -> ${out}`);
}

console.log("\n  CULPABLE -- toggling this flag changes our answer at all:");
for (const [flag, n] of [...culpable].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(4)}  ${flag}`);
}

console.log(
  `\n  ${noFlagMoves} of ${diverging.length} documents are moved by NO flag` +
    ` -- their mechanism is unconditional and has no switch.`,
);
