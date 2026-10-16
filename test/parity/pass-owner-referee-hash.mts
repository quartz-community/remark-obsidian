/**
 * Hash every REFEREE document's footnote facts per document, for `pass-owner.mts --referee`.
 *
 * The corpus hasher beside this one answers ownership over 3,439 cases that are 99.7%
 * matching, so its "unowned and diverging" set is two documents. The backlog is the referee's
 * 1,073 disagreements, and attributing those is what makes work systematic rather than a hunt.
 *
 * Facts rather than whole trees, deliberately: the referee's oracle is definitions and
 * references, so a pass that reshapes a tree without moving a fact is not an owner of any
 * answer here. That is the same distinction `score.mts` draws between distance and agreement.
 *
 * A separate process per permutation for the reason the sibling records: `tsx` caches modules,
 * so re-importing `chain.js` after rewriting `src/index.ts` would keep running the old chain.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { refereeFactsWithTree } from "./referee-facts.js";

const out = process.argv[2];
const dir = process.env.PARITY_REFEREE_DIR;
if (out === undefined || dir === undefined) {
  console.log(
    "pass-owner-referee-hash: give an output path, and set PARITY_REFEREE_DIR",
  );
  process.exit(1);
}

interface Entry {
  readonly text: string;
  readonly defs?: unknown[];
  readonly refs?: unknown[];
  readonly code?: [number, number][];
}

const shapes: Record<string, string> = {};
/** Whether OUR answer equals the oracle's, so a removal's effect can be signed. */
const agrees: Record<string, boolean> = {};
let threw = 0;

/** Order-insensitive, for HASHING a shape: a pass that reorders rows has not changed an answer. */
const key = (rows: readonly unknown[]): string =>
  JSON.stringify(rows.map((row) => JSON.stringify(row)).sort());

/**
 * `referee.mts`'s OWN agreement test, not a reimplementation of it.
 *
 * Mine was stricter in three ways and reported 5,677 agreeing where the referee reports 5,745 --
 * a 68-document gap that silently inflated every "diverging" figure derived from it. The
 * differences, each of which the referee documents:
 *
 *   - an EMPTY-NAMED reference is excluded from BOTH sides, because `^[]` is in Obsidian's
 *     cache and the corpus's producer does not compare the field
 *   - the comparison is ORDER-SENSITIVE, with no sort
 *   - `code` is a SEPARATE dimension and is not part of the footnote agreement figure
 *
 * This file's own notes name the mistake: "a reimplemented agreement test reads as independent
 * confirmation while measuring something slightly different". It is still a copy rather than an
 * import, because `referee.mts` runs its comparison at module scope -- so it carries the same
 * warning the duplicated `blocksOf` does.
 */
const named = (rows: readonly unknown[]): readonly unknown[] =>
  rows.filter((row) => (row as readonly unknown[])[0] !== "");
const same = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  JSON.stringify(named(a)) === JSON.stringify(named(b));

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const raw: unknown = JSON.parse(
    fs.readFileSync(path.join(dir, file), "utf8"),
  );
  const list = (
    Array.isArray(raw) ? raw : Object.values(raw as object)
  ) as Entry[];
  for (const [index, entry] of list.entries()) {
    const id = `${file}#${index}`;
    try {
      const ours = refereeFactsWithTree(entry.text);
      // THE THIRD DIMENSION. The referee reports `code` -- Obsidian's own root-level code
      // ranges -- on 883 documents, 141 of which disagree, and attributing only `defs` and
      // `refs` left every one of those unowned. Root children only, which is how the referee
      // itself compares them: a `code` node inside a container is not a root section.
      const ourCode = ours.tree.children
        .filter((child) => child.type === "code" && child.position)
        .map((child) => [
          child.position!.start.line - 1,
          child.position!.end.line - 1,
        ]);
      // PER FIELD, not one hash for the pair. A document diverging only on its references
      // told us nothing about which pass owns the references, because the combined hash moved
      // whichever field changed. The referee's oracle has two fields and they are owned
      // separately -- the tab-quote rule owned definitions while leaving references alone,
      // and that distinction is the whole reason it shipped.
      const digest = (value: string): string =>
        crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
      shapes[`${id}\u0000defs`] = digest(key(ours.defs));
      shapes[`${id}\u0000refs`] = digest(key(ours.refs));
      shapes[`${id}\u0000code`] = digest(key(ourCode));
      // The FOOTNOTE agreement figure, which is what `referee.mts` reports as its headline.
      // `code` is hashed above for ownership but deliberately NOT folded in here: it is a
      // separate dimension with its own 883-document population, and including it is what made
      // this disagree with the referee by 68 documents.
      agrees[id] =
        same(ours.defs, entry.defs ?? []) && same(ours.refs, entry.refs ?? []);
    } catch {
      shapes[`${id}\u0000defs`] = "THREW";
      shapes[`${id}\u0000refs`] = "THREW";
      shapes[`${id}\u0000code`] = "THREW";
      agrees[id] = false;
      threw += 1;
    }
  }
}
fs.writeFileSync(out, JSON.stringify({ shapes, agrees }));
console.log(
  `documents=${Object.keys(shapes).length} agreeing=${Object.values(agrees).filter(Boolean).length} threw=${threw}`,
);
