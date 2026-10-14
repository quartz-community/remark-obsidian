import fs from "node:fs";
import path from "node:path";

import { refereeFacts } from "./referee-facts.js";

/**
 * The referee's disagreements, grouped by WHAT DIFFERS rather than by their text.
 *
 * Four selectors over the INPUT have died in this harness -- probes per open case,
 * co-occurrence, construct frequency, line-local prefix -- and each death was recorded as
 * evidence that the remainder is unstructured. It was evidence that the remainder is not
 * structured BY TEXT. A selector over the ERROR finds 72 shapes with 82% of the disagreement
 * in the top ten, which is a queue rather than a tail.
 *
 * The signature is counts and deltas ONLY, never anything document-specific, so two notes
 * sharing a mechanism share a signature whatever constructs they carry. That is the whole
 * reason it works where the text-shaped selectors did not.
 *
 *   tsx test/parity/shapes.mts                   the ranked table of every shape
 *   tsx test/parity/shapes.mts --shape def-col    its documents, SHORTEST first, with deltas
 *   tsx test/parity/shapes.mts --shape def-col --limit 5
 *
 * Shortest first because a short note has room for one cause, which is the same reason the
 * reduction tool sorts that way. `PARITY_REFEREE_DIR` points at a clone of the sibling
 * project; the corpus is not vendored.
 */
type Def = [string, number, number, number];
type Ref = [string, number, number];

interface Entry {
  readonly text: string;
  readonly defs: readonly Def[];
  readonly refs: readonly Ref[];
}

const dir =
  process.env.PARITY_REFEREE_DIR ??
  "/tmp/obsidian-footnotes/test/obsidian-answers";
if (!fs.existsSync(dir)) {
  console.log(`shapes: no corpus at ${dir}`);
  process.exit(0);
}

const wantShape = (() => {
  const at = process.argv.indexOf("--shape");
  return at === -1 ? undefined : process.argv[at + 1];
})();
const limit = (() => {
  const at = process.argv.indexOf("--limit");
  return at === -1 ? 8 : Number(process.argv[at + 1]);
})();

const fold = (s: string) => s.toLowerCase();

/** What differs, as a signature: counts and signed deltas, nothing from the document. */
function signatureOf(
  entry: Entry,
  got: { defs: readonly Def[]; refs: readonly Ref[] },
): { shape: string; detail: string[] } {
  const parts: string[] = [];
  const detail: string[] = [];

  const theirs = new Map(entry.defs.map((d) => [`${fold(d[0])}@${d[1]}`, d]));
  const ours = new Map(got.defs.map((d) => [`${fold(d[0])}@${d[1]}`, d]));
  let miss = 0;
  let extra = 0;
  const endDelta = new Set<number>();
  let colDelta = false;
  for (const [key, d] of theirs) {
    const mine = ours.get(key);
    if (!mine) {
      miss += 1;
      detail.push(`def MISSING ${JSON.stringify(d)}`);
      continue;
    }
    if (mine[3] !== d[3]) {
      endDelta.add(mine[3] - d[3]);
      detail.push(`def end ${d[3]} -> ${mine[3]} for ${JSON.stringify(d)}`);
    }
    if (mine[2] !== d[2]) {
      colDelta = true;
      detail.push(`def col ${d[2]} -> ${mine[2]} for ${JSON.stringify(d)}`);
    }
  }
  for (const [key, d] of ours) {
    if (!theirs.has(key)) {
      extra += 1;
      detail.push(`def INVENTED ${JSON.stringify(d)}`);
    }
  }
  if (miss > 0) parts.push("def-miss");
  if (extra > 0) parts.push("def-extra");
  for (const delta of [...endDelta].sort((a, b) => a - b)) {
    parts.push(`def-end${delta > 0 ? "+" : ""}${delta}`);
  }
  if (colDelta) parts.push("def-col");

  const theirRefs = new Set(
    entry.refs.map((r) => `${fold(r[0])}@${r[1]}:${r[2]}`),
  );
  const ourRefs = new Set(got.refs.map((r) => `${fold(r[0])}@${r[1]}:${r[2]}`));
  let refMiss = 0;
  let refExtra = 0;
  for (const key of theirRefs) {
    if (!ourRefs.has(key)) {
      refMiss += 1;
      detail.push(`ref MISSING ${key}`);
    }
  }
  for (const key of ourRefs) {
    if (!theirRefs.has(key)) {
      refExtra += 1;
      detail.push(`ref INVENTED ${key}`);
    }
  }
  if (refMiss > 0) parts.push("ref-miss");
  if (refExtra > 0) parts.push("ref-extra");

  return {
    shape: parts.length > 0 ? parts.join("+") : "equal-sets-unequal-order",
    detail,
  };
}

interface Hit {
  readonly key: string;
  readonly text: string;
  readonly detail: readonly string[];
}

const byShape = new Map<string, Hit[]>();
let total = 0;
let disagreeing = 0;

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const raw: unknown = JSON.parse(
    fs.readFileSync(path.join(dir, file), "utf8"),
  );
  const entries = (
    Array.isArray(raw) ? raw : Object.values(raw as Record<string, unknown>)
  ) as Entry[];

  for (const [at, entry] of entries.entries()) {
    total += 1;
    let got;
    try {
      got = refereeFacts(entry.text);
    } catch {
      continue;
    }
    const key = (rows: readonly unknown[][]) =>
      JSON.stringify(rows.map((row) => JSON.stringify(row)).sort());
    if (
      key(got.defs as Def[]) === key(entry.defs) &&
      key(got.refs as Ref[]) === key(entry.refs)
    ) {
      continue;
    }
    disagreeing += 1;
    const { shape, detail } = signatureOf(entry, got as never);
    const list = byShape.get(shape) ?? [];
    list.push({ key: `${file}#${at}`, text: entry.text, detail });
    byShape.set(shape, list);
  }
}

const ranked = [...byShape].sort((a, b) => b[1].length - a[1].length);

if (wantShape !== undefined) {
  const hits = byShape.get(wantShape);
  if (!hits) {
    console.log(`shapes: no shape "${wantShape}"`);
    process.exit(0);
  }
  console.log(`${wantShape}: ${hits.length} documents\n`);
  const shortest = [...hits].sort((a, b) => a.text.length - b.text.length);
  for (const hit of shortest.slice(0, limit)) {
    console.log(`  ${hit.key}  (${hit.text.length} bytes)`);
    console.log(`    ${JSON.stringify(hit.text).slice(0, 180)}`);
    for (const line of hit.detail) console.log(`      ${line}`);
    console.log("");
  }
  process.exit(0);
}

console.log(
  `shapes: ${disagreeing} disagreeing of ${total}, in ${ranked.length} shapes\n`,
);
let running = 0;
for (const [shape, hits] of ranked) {
  running += hits.length;
  const cum = ((100 * running) / disagreeing).toFixed(1);
  console.log(
    `  ${String(hits.length).padStart(5)}  ${cum.padStart(5)}%  ${shape}`,
  );
}
