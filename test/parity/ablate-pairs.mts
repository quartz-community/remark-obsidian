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
 * Which PAIR of passes would have to change, for documents no single pass can fix.
 *
 * `ablate.mts` finds a flag that flips a document to agreement on its own. Most documents have
 * none: of 548 name-dimension divergences only 159 do, 63 are moved by no flag at all, and the
 * remaining 326 are moved by some flag while agreeing with none. Those are the ones a
 * one-change-at-a-time workflow cannot reach, because each half measures as a regression and
 * gets reverted -- the +37 tab rule needed three constructs at once and its first two measured
 * -4 together.
 *
 * This reports pairs, so a batch can be chosen on evidence instead of on a hunch.
 */
const BASE = PROFILES["all-features"].remarkObsidian as RemarkObsidianFlags &
  Record<string, unknown>;
const FLAGS = Object.keys(BASE).filter((k) => typeof BASE[k] === "boolean");

function answerOf(markdown: string, flags: Record<string, unknown>): string {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, flags as RemarkObsidianFlags)
    .use(remarkBreaks);
  const source = applyTextTransform(markdown);
  const facts = factsOf(
    processor.runSync(processor.parse(source), source) as Root,
    source,
  );
  return JSON.stringify([facts.defs, facts.refs]);
}

/** NAMES only, which is the dimension this run is for. */
function namesOf(answer: string): string {
  const [defs, refs] = JSON.parse(answer) as [
    [string, number, number, number][],
    [string, number, number][],
  ];
  return JSON.stringify(
    [
      ...defs.map((d) => `d:${d[0].toLowerCase()}`),
      ...refs.map((r) => `r:${r[0].toLowerCase()}`),
    ].sort(),
  );
}

const dir =
  process.env["PARITY_REFEREE_DIR"] ?? "/tmp/opencode/corrected-answers";
const wanted = new Set(
  fs
    .readFileSync(process.argv[2] ?? "/tmp/opencode/name-div-ids.txt", "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean),
);

const entries: { id: string; text: string; oracle: string }[] = [];
for (const file of fs.readdirSync(dir).sort()) {
  if (!file.endsWith(".json")) continue;
  const parsed: unknown = JSON.parse(
    fs.readFileSync(path.join(dir, file), "utf8"),
  );
  for (const [index, row] of (
    (Array.isArray(parsed) ? parsed : []) as Record<string, unknown>[]
  ).entries()) {
    const id = (row["id"] as string | undefined) ?? `${file}#${index}`;
    const text = row["text"];
    if (typeof text !== "string" || text === "" || !wanted.has(id)) continue;
    entries.push({
      id,
      text,
      oracle: namesOf(JSON.stringify([row["defs"] ?? [], row["refs"] ?? []])),
    });
  }
}

// Only documents no SINGLE flag fixes, which is what pairs are for.
const open: { id: string; text: string; oracle: string }[] = [];
for (const entry of entries) {
  let fixed = false;
  try {
    for (const flag of FLAGS) {
      if (
        namesOf(answerOf(entry.text, { ...BASE, [flag]: !BASE[flag] })) ===
        entry.oracle
      ) {
        fixed = true;
        break;
      }
    }
  } catch {
    continue;
  }
  if (!fixed) open.push(entry);
}

console.log(
  `  ${entries.length} name-diverging documents, ${open.length} that NO single flag fixes\n`,
);

const hits = new Map<string, string[]>();
for (const entry of open) {
  for (let a = 0; a < FLAGS.length; a++) {
    for (let b = a + 1; b < FLAGS.length; b++) {
      const flags = {
        ...BASE,
        [FLAGS[a]!]: !BASE[FLAGS[a]!],
        [FLAGS[b]!]: !BASE[FLAGS[b]!],
      };
      let got: string;
      try {
        got = namesOf(answerOf(entry.text, flags));
      } catch {
        continue;
      }
      if (got !== entry.oracle) continue;
      const key = `${FLAGS[a]!} + ${FLAGS[b]!}`;
      hits.set(key, [...(hits.get(key) ?? []), entry.id]);
    }
  }
}

console.log("  PAIRS that flip a document no single flag can:");
const ranked = [...hits].sort((x, y) => y[1].length - x[1].length);
if (ranked.length === 0) console.log("    (none)");
for (const [pair, ids] of ranked.slice(0, 14)) {
  console.log(
    `    ${String(ids.length).padStart(4)}  ${pair.padEnd(40)} e.g. ${ids.slice(0, 2).join(", ")}`,
  );
}
const reach = new Set(ranked.flatMap(([, ids]) => ids));
console.log(
  `\n  ${reach.size} of ${open.length} reachable by SOME pair; ${open.length - reach.size} need three or more.`,
);
