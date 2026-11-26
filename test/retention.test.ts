// A parsed tree keeps memory proportional to its source, not to the square of it (#48).
//
// remark-parse 8's `reset` and `test` rebuilt the remaining source as `subvalue + value` after
// every table, list and other reader that eats and then rewinds. Each rebuild is a new string,
// and the text nodes read after it are V8 slices of that string, so they kept every rebuilt
// remainder alive: 2,000 table-and-paragraph blocks (242 KB) retained about 240 MiB. The
// vendored tokenizer now gives back the string it was handed, and the same tree keeps about 9.
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(here, "retention", "measure.ts");

async function retainedMiB(blocks: number): Promise<number> {
  const { stdout } = await run(
    process.execPath,
    [
      "--expose-gc",
      "--import",
      "tsx",
      "--conditions=development",
      runner,
      String(blocks),
    ],
    { timeout: 60_000, cwd: path.join(here, "..") },
  );
  return Number(stdout) / 2 ** 20;
}

describe("retained memory", () => {
  // Measured, fresh processes: about 4.9 and 9.2 MiB at 1,000 and 2,000 blocks; 63 and 240
  // before. The bound leaves room for runtime noise and still fails the old tokenizer fourfold.
  it("keeps a linear amount of memory for repeated tables and paragraphs", async () => {
    const [small, large] = [await retainedMiB(1_000), await retainedMiB(2_000)];
    expect(large).toBeLessThan(60);
    // Doubling the source about doubles what is kept; quadratic retention quadruples it.
    expect(large / small).toBeLessThan(3);
  }, 120_000);
});
