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

import { refereeFacts } from "./referee-facts.js";

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
}

const shapes: Record<string, string> = {};
/** Whether OUR answer equals the oracle's, so a removal's effect can be signed. */
const agrees: Record<string, boolean> = {};
let threw = 0;

const key = (rows: readonly unknown[]): string =>
  JSON.stringify(rows.map((row) => JSON.stringify(row)).sort());

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
      const ours = refereeFacts(entry.text);
      // PER FIELD, not one hash for the pair. A document diverging only on its references
      // told us nothing about which pass owns the references, because the combined hash moved
      // whichever field changed. The referee's oracle has two fields and they are owned
      // separately -- the tab-quote rule owned definitions while leaving references alone,
      // and that distinction is the whole reason it shipped.
      const digest = (value: string): string =>
        crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
      shapes[`${id}\u0000defs`] = digest(key(ours.defs));
      shapes[`${id}\u0000refs`] = digest(key(ours.refs));
      agrees[id] =
        key(ours.defs) === key(entry.defs ?? []) &&
        key(ours.refs) === key(entry.refs ?? []);
    } catch {
      shapes[`${id}\u0000defs`] = "THREW";
      shapes[`${id}\u0000refs`] = "THREW";
      agrees[id] = false;
      threw += 1;
    }
  }
}
fs.writeFileSync(out, JSON.stringify({ shapes, agrees }));
console.log(
  `documents=${Object.keys(shapes).length} agreeing=${Object.values(agrees).filter(Boolean).length} threw=${threw}`,
);
