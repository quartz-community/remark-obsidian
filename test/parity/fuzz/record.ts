import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { GoldenCase } from "../types.js";

export interface Recorded {
  readonly cases: Record<string, GoldenCase>;
  readonly mathTex: boolean;
}

/**
 * Render a batch of documents inside real Obsidian and read the result back.
 *
 * One batch per call, never one document per call. Obsidian costs seconds to
 * start and milliseconds per case, so the batch size barely affects the clock
 * while the number of calls dominates it entirely — which is what makes
 * shrinking dozens of failures at once affordable where shrinking them one
 * after another would not be.
 */
export function recordBatch(
  entries: ReadonlyArray<{ id: string; markdown: string }>,
): Recorded {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fuzz-"));
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
  fs.rmSync(dir, { recursive: true, force: true });
  return { cases: file.cases, mathTex: file.oracle?.mathTex ?? false };
}
