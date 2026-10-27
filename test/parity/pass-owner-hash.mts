/**
 * Hash every corpus case's tree PER CASE, for `pass-owner.mts`.
 *
 * `pass-order-hash.mts` folds the whole corpus into one digest, which answers "did anything
 * change" and nothing else. Attribution needs to know WHICH cases changed, so this writes a
 * map instead.
 *
 * A separate entry point for the same reason that one is: the audit needs a FRESH process per
 * permutation, because `tsx` caches modules and re-importing `chain.js` after rewriting
 * `src/index.ts` would keep running the old chain.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseOurs } from "./chain.js";
import type { GoldenCase } from "./types.js";

const out = process.argv[2];
if (out === undefined) {
  console.log("pass-owner-hash: give an output path");
  process.exit(1);
}

const goldens = path.join(import.meta.dirname, "goldens/obsidian.json");
const golden = JSON.parse(fs.readFileSync(goldens, "utf8")) as {
  cases: Record<string, GoldenCase>;
};

const shapes: Record<string, string> = {};
let threw = 0;
for (const [id, entry] of Object.entries(golden.cases)) {
  for (const profile of ["quartz-default", "all-features"] as const) {
    let shape: string;
    try {
      shape = JSON.stringify(parseOurs(entry.markdown, profile));
    } catch {
      shape = "THREW";
      threw += 1;
    }
    shapes[`${id}\u0000${profile}`] = crypto
      .createHash("sha256")
      .update(shape)
      .digest("hex")
      .slice(0, 16);
  }
}
fs.writeFileSync(out, JSON.stringify(shapes));
console.log(`cases=${Object.keys(shapes).length} threw=${threw}`);
