/**
 * Which MECHANISM each diverging document carries, and how many each carries at once.
 *
 *     PARITY_REFEREE_DIR=/tmp/of/test/obsidian-answers \
 *       npx tsx --conditions=development test/parity/mechanism.mts
 *
 * This exists because a rule can be `better 9 / worse 0` and still move agreement by ZERO.
 * `item-comment` did exactly that: nine documents moved closer and not one reached agreement,
 * which can only mean each carried ANOTHER divergence the rule does not touch. If that is
 * general, every single-mechanism rule scores FLAT however correct it is, and the scorer only
 * says so after the rule is written.
 *
 * So the question worth answering first is not "which mechanism is biggest" but **which
 * documents are ONE mechanism away from agreeing**. Those are the only documents any single
 * rule can flip, and the mechanism that dominates them is the only candidate that can score
 * non-flat. Everything else needs its co-occurring partner fixed in the same change -- which is
 * how the isolate axis went 43 to 0 here, on two fixes that were "useless apart and measured
 * together".
 *
 * Mechanism is read on the axis that keeps working in this file: WHICH OF OUR NODES covers the
 * position the recorded answer indexes. Six selectors over the INPUT have died here --
 * probes-per-case, co-occurrence of constructs, construct frequency, line-local prefix,
 * exact-string dedup, and normalised text shape -- while this axis put 104 of 337 `ref-miss`
 * entries and 136 of 229 `def-miss` entries in one bucket each.
 *
 * Compared against the RECORDED answers rather than live Obsidian, deliberately: the figure
 * this is trying to move is the referee's, so the premise has to be the referee's too.
 */
import fs from "node:fs";
import path from "node:path";

import { refereeFactsWithTree } from "./referee-facts.js";

import type { Root } from "mdast";
import type { Node, Parent } from "unist";

interface Entry {
  readonly id?: string;
  readonly text: string;
  readonly defs: readonly (readonly [string, number, number, number])[];
  readonly refs: readonly (readonly [string, number, number])[];
}

const dir =
  process.env.PARITY_REFEREE_DIR ??
  "/tmp/obsidian-footnotes/test/obsidian-answers";
if (!fs.existsSync(dir)) {
  console.log(`mechanism: no corpus at ${dir}`);
  process.exit(0);
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

/** Zero-based line and column to a flat offset, the only unit positions compare in. */
function offsetOf(lines: readonly string[], line: number, col: number): number {
  let at = 0;
  for (let n = 0; n < line && n < lines.length; n++) at += lines[n]!.length + 1;
  return at + col;
}

/** The DEEPEST node covering an offset -- the mechanism, named by what we built there. */
function coverOf(tree: Root, offset: number): string {
  let node: Node = tree;
  let deepest = "nothing";
  for (;;) {
    const kids = (node as Parent).children;
    if (!Array.isArray(kids)) break;
    const hit = kids.find((kid) => {
      const from = kid.position?.start?.offset;
      const to = kid.position?.end?.offset;
      return (
        from !== undefined && to !== undefined && offset >= from && offset < to
      );
    });
    if (!hit) break;
    deepest = hit.type;
    node = hit;
  }
  return deepest;
}

const named = <T extends readonly unknown[]>(rows: readonly T[]) =>
  rows.filter((row) => row[0] !== "");
/** The referee's own comparison: empty names excluded, ORDER-SENSITIVE, `code` separate. */
const agrees = (a: readonly unknown[][], b: readonly unknown[][]) =>
  JSON.stringify(named(a)) === JSON.stringify(named(b));

const perDocument = new Map<string, Set<string>>();
let diverging = 0;
let threw = 0;

for (const [index, entry] of entries.entries()) {
  const id = entry.id ?? String(index);
  if (entry.text === "") continue;
  let ours;
  try {
    ours = refereeFactsWithTree(entry.text);
  } catch {
    threw += 1;
    continue;
  }
  const wantDefs = named(entry.defs);
  const wantRefs = named(entry.refs);
  if (
    agrees(
      ours.defs as unknown as readonly unknown[][],
      wantDefs as unknown as readonly unknown[][],
    ) &&
    agrees(
      ours.refs as unknown as readonly unknown[][],
      wantRefs as unknown as readonly unknown[][],
    )
  ) {
    continue;
  }
  diverging += 1;

  const lines = entry.text.split("\n");
  const key = (name: string) => name.toLowerCase();
  const ourDefs = new Map(ours.defs.map((d) => [key(d[0]), d]));
  const ourRefs = new Map(ours.refs.map((r) => [key(r[0]), r]));
  const wantDefMap = new Map(wantDefs.map((d) => [key(d[0]), d]));
  const wantRefMap = new Map(wantRefs.map((r) => [key(r[0]), r]));

  const found = new Set<string>();
  for (const [name, def] of wantDefMap) {
    if (!ourDefs.has(name)) {
      found.add(
        `def-miss @ ${coverOf(ours.tree, offsetOf(lines, def[1], def[2]))}`,
      );
    }
  }
  for (const [name, def] of ourDefs) {
    if (!wantDefMap.has(name)) {
      found.add(
        `def-extra @ ${coverOf(ours.tree, offsetOf(lines, def[1], def[2]))}`,
      );
    }
  }
  for (const [name, ref] of wantRefMap) {
    if (!ourRefs.has(name)) {
      found.add(
        `ref-miss @ ${coverOf(ours.tree, offsetOf(lines, ref[1], ref[2]))}`,
      );
    }
  }
  for (const [name, ref] of ourRefs) {
    if (!wantRefMap.has(name)) {
      found.add(
        `ref-extra @ ${coverOf(ours.tree, offsetOf(lines, ref[1], ref[2]))}`,
      );
    }
  }
  // Positional, and it must be kept separate: a document whose names all match and whose
  // columns do not is NOT a counting bug, and folding it into the sets above would report it
  // as agreement. Line numbers are compared as a SPAN rather than an end, because an end moves
  // when anything above it does.
  for (const [name, def] of ourDefs) {
    const theirs = wantDefMap.get(name);
    if (!theirs) continue;
    if (def[2] !== theirs[2]) found.add("def-col");
    if (def[3] - def[1] !== theirs[3] - theirs[1]) {
      found.add(
        def[3] - def[1] > theirs[3] - theirs[1]
          ? "def-span-longer"
          : "def-span-shorter",
      );
    }
  }
  for (const [name, ref] of ourRefs) {
    const theirs = wantRefMap.get(name);
    if (theirs && ref[2] !== theirs[2]) found.add("ref-col");
  }
  if (found.size === 0) found.add("unclassified");
  perDocument.set(id, found);
}

console.log(
  `mechanism: ${entries.length} documents, ${diverging} diverging, ${threw} threw`,
);

const histogram = new Map<number, number>();
for (const set of perDocument.values()) {
  histogram.set(set.size, (histogram.get(set.size) ?? 0) + 1);
}
console.log(
  "\n  MECHANISMS PER DOCUMENT -- how many a single rule has to beat:",
);
for (const size of [...histogram.keys()].sort((a, b) => a - b)) {
  const n = histogram.get(size)!;
  console.log(
    `    ${String(size).padStart(2)} mechanism(s) : ${String(n).padStart(4)} documents` +
      (size === 1 ? "   <- a single rule can flip these" : ""),
  );
}

const oneAway = new Map<string, number>();
const everywhere = new Map<string, number>();
for (const set of perDocument.values()) {
  for (const mechanism of set) {
    everywhere.set(mechanism, (everywhere.get(mechanism) ?? 0) + 1);
  }
  if (set.size !== 1) continue;
  const only = [...set][0]!;
  oneAway.set(only, (oneAway.get(only) ?? 0) + 1);
}

console.log(
  "\n  BY MECHANISM: documents where it is the ONLY divergence, against where it appears at all",
);
console.log(
  `  ${"mechanism".padEnd(34)} ${"one-away".padStart(8)} ${"present".padStart(8)}`,
);
const ranked = [...everywhere.entries()].sort(
  (a, b) => (oneAway.get(b[0]) ?? 0) - (oneAway.get(a[0]) ?? 0) || b[1] - a[1],
);
for (const [mechanism, present] of ranked.slice(0, 20)) {
  console.log(
    `    ${mechanism.padEnd(32)} ${String(oneAway.get(mechanism) ?? 0).padStart(8)} ${String(present).padStart(8)}`,
  );
}

const pairs = new Map<string, number>();
for (const set of perDocument.values()) {
  if (set.size !== 2) continue;
  pairs.set(
    [...set].sort().join("  +  "),
    (pairs.get([...set].sort().join("  +  ")) ?? 0) + 1,
  );
}
console.log("\n  TWO-MECHANISM DOCUMENTS: the pairs worth fixing TOGETHER");
for (const [pair, n] of [...pairs.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 14)) {
  console.log(`    ${String(n).padStart(4)}  ${pair}`);
}

fs.writeFileSync(
  "/tmp/mechanism.json",
  JSON.stringify(
    Object.fromEntries(
      [...perDocument].map(([id, set]) => [id, [...set].sort()]),
    ),
    null,
    2,
  ),
);
console.log("\n  per-document map: /tmp/mechanism.json");
