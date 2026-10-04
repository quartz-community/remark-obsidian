import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { compareCase } from "../compare.js";
import type { GoldenCase } from "../types.js";
import { generate } from "./generate.js";

/**
 * Reduce a failing document to the smallest one that still disagrees.
 *
 * A generated document is three blocks of nested, half-broken delimiters, and
 * "seed 3 disagrees" is not a bug report — most of those characters have
 * nothing to do with the disagreement. Shrinking turns it into something a
 * person can read and a corpus can keep.
 *
 * Candidates are recorded in one batch per round rather than one at a time.
 * Obsidian takes seconds to start and milliseconds per case, so a round of
 * fifty candidates costs about what a single candidate would, and three or
 * four rounds reduce most documents to a line or two.
 *
 *   npx tsx --conditions=development test/parity/fuzz/shrink.ts <seed>
 */

/** Every way of making this document smaller, largest reduction first. */
function candidates(markdown: string): string[] {
  const out = new Set<string>();
  const blocks = markdown.split("\n\n");
  const lines = markdown.replace(/\n$/, "").split("\n");

  if (blocks.length > 1) {
    for (let i = 0; i < blocks.length; i++) {
      out.add(blocks.filter((_, j) => j !== i).join("\n\n"));
    }
  }
  for (let i = 0; i < lines.length; i++) {
    out.add(lines.filter((_, j) => j !== i).join("\n"));
  }
  // Halving a long line finds the offending span far faster than deleting
  // one character at a time would.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.length < 8) continue;
    const half = Math.floor(line.length / 2);
    for (const shorter of [line.slice(0, half), line.slice(half)]) {
      out.add(lines.map((l, j) => (j === i ? shorter : l)).join("\n"));
    }
  }

  return [...out]
    .map((text) => (text.endsWith("\n") ? text : text + "\n"))
    .filter((text) => text.trim() !== "" && text.length < markdown.length)
    .sort((a, b) => a.length - b.length);
}

function recordBatch(
  entries: Array<{ id: string; markdown: string }>,
): Record<string, GoldenCase> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shrink-"));
  const input = path.join(dir, "cases.json");
  const output = path.join(dir, "golden.json");
  fs.writeFileSync(input, JSON.stringify(entries));

  execFileSync("npm", ["run", "parity:record"], {
    env: {
      ...process.env,
      PARITY_FUZZ_FILE: input,
      PARITY_GOLDEN_PATH: output,
    },
    stdio: "ignore",
  });

  const file = JSON.parse(fs.readFileSync(output, "utf8")) as {
    oracle?: { mathTex?: boolean };
    cases: Record<string, GoldenCase>;
  };
  mathTex = file.oracle?.mathTex ?? false;
  return file.cases;
}

let mathTex = false;

const seedArg = process.argv[2];
if (!seedArg) {
  console.error("usage: shrink <seed>");
  process.exit(2);
}

let current = generate(Number(seedArg));
console.log(`seed ${seedArg}, ${current.length} chars`);

for (let round = 1; round <= 6; round++) {
  const batch = candidates(current)
    .slice(0, 60)
    .map((markdown, index) => ({ id: `fuzz/c${index}`, markdown }));
  if (batch.length === 0) break;

  const recorded = recordBatch(batch);
  const stillFails = batch.find((entry) => {
    const golden = recorded[entry.id];
    return golden !== undefined && !compareCase(golden, mathTex).matched;
  });

  if (!stillFails) {
    console.log(`round ${round}: nothing smaller still fails; done`);
    break;
  }
  current = stillFails.markdown;
  console.log(`round ${round}: down to ${current.length} chars`);
}

console.log("\nminimal failing document:");
console.log(JSON.stringify(current));
