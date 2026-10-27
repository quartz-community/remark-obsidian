/**
 * Hash every corpus case's tree under both profiles, for `pass-order.mts`.
 *
 * A separate entry point because the audit needs a FRESH process per permutation: `tsx`
 * caches modules, so re-importing `chain.js` after rewriting `src/index.ts` would keep
 * running the old chain and every permutation would hash identically.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseOurs } from "./chain.js";
import type { GoldenCase } from "./types.js";

const goldens = path.join(import.meta.dirname, "goldens/obsidian.json");
const golden = JSON.parse(fs.readFileSync(goldens, "utf8")) as {
  cases: Record<string, GoldenCase>;
};

const digest = crypto.createHash("sha256");
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
    digest.update(`${id}\u0000${profile}\u0000${shape}\u0001`);
  }
}
console.log(`${digest.digest("hex").slice(0, 32)} threw=${threw}`);
