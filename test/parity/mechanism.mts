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

import { REFEREE_ANSWERS, loadCorpus } from "./classify.js";
import { refereeFactsWithTree } from "./referee-facts.js";

import type { Root } from "mdast";
import type { Node, Parent } from "unist";

const dir = process.env.PARITY_REFEREE_DIR ?? REFEREE_ANSWERS;
if (!fs.existsSync(dir)) {
  console.log(`mechanism: no corpus at ${dir}`);
  process.exit(0);
}

// Loading goes through `classify.ts` rather than a local reader. Verified semantics-preserving
// before the swap, not after: on this corpus 0 rows lack a `text` key, 0 have an empty one, 0
// facts are `[inline*` pseudo-facts and 0 answer files are non-arrays, so every guard the shared
// loader applies is a no-op here and this instrument's output is byte-identical.
const entries = loadCorpus(dir);

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

/** A fact's own node types, which must not be reported as that fact's host. */
const FACT_NODES = new Set(["footnoteReference", "footnoteDefinition", "text"]);

/**
 * `coverOf` for an EXTRA fact, which has to name its HOST rather than itself.
 *
 * For a MISSING fact the deepest covering node is the answer: it names what swallowed the fact.
 * For an EXTRA one the deepest node is the node WE WRONGLY CREATED, so `coverOf` reports
 * `ref-extra @ footnoteReference` -- "we invented a reference, and the node there is the
 * reference we invented". True of every such document by construction, and it conveys nothing.
 *
 * That mattered: the tautological label sat at the TOP of this file's own table, at 92 one-away
 * documents for `ref-extra` and 115 present for `def-extra`, so the two largest rows were the
 * two carrying no mechanism. Skipping the fact's own types reports the paragraph, list item,
 * comment or code node that hosts it, which is the thing a rule has to be written against.
 */
function hostOf(tree: Root, offset: number): string {
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
    if (!FACT_NODES.has(hit.type)) deepest = hit.type;
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
  /**
   * Keyed by name AND LINE, not by name alone.
   *
   * A name-keyed map collapses duplicates, and the referee compares ORDER-SENSITIVE ARRAYS, so
   * `[^2]` referenced on two lines looked identical in the map while the arrays differed. Every
   * one of the 49 documents this labeller reported as `unclassified` had a duplicate name --
   * 42 on references, 7 on definitions, and ZERO that were order-only -- so the bucket was not
   * an unknown mechanism, it was this blind spot.
   *
   * Line is enough to separate them and keeps the col and span comparisons below pairable: a
   * label occurs at most once per line, which is what makes `name@line` a key rather than a
   * guess.
   */
  const key = (name: string, line: number) => `${name.toLowerCase()}@${line}`;
  const ourDefs = new Map(ours.defs.map((d) => [key(d[0], d[1]), d]));
  const ourRefs = new Map(ours.refs.map((r) => [key(r[0], r[1]), r]));
  const wantDefMap = new Map(wantDefs.map((d) => [key(d[0], d[1]), d]));
  const wantRefMap = new Map(wantRefs.map((r) => [key(r[0], r[1]), r]));

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
        `def-extra @ ${hostOf(ours.tree, offsetOf(lines, def[1], def[2]))}`,
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
        `ref-extra @ ${hostOf(ours.tree, offsetOf(lines, ref[1], ref[2]))}`,
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
  // A document that diverges with nothing named is now ORDER ONLY -- the same multiset in a
  // different sequence -- which the referee counts as disagreement and nothing above can see.
  // Measured at zero on this corpus, and kept as a named outcome rather than a silent bucket
  // so it cannot absorb the next blind spot.
  if (found.size === 0) found.add("order-only");
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
