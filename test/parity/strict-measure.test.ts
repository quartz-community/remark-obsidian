import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `strict`'s four figures held by identity: no spec example may start diverging from stock, and
 * no recorded case, referee definition or referee reference `strict` agrees on may be lost.
 * `strict-measure.mts` does the measuring, and first proves `PARITY_PRESET` reached the chain;
 * after an intended change, refresh the baseline with its `--update`, which refuses while
 * anything is lost.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

describe("strict's measured figures", () => {
  it("lose nothing against goldens/strict-measure.json", () => {
    let output = "";
    let status = 0;
    try {
      output = execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--conditions=development",
          path.join(here, "strict-measure.mts"),
          "--baseline",
          path.join(here, "goldens/strict-measure.json"),
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (error) {
      const failed = error as {
        status?: number;
        stdout?: string;
        stderr?: string;
      };
      status = failed.status ?? 1;
      output = `${failed.stdout ?? ""}${failed.stderr ?? ""}`;
    }
    expect(output, output).not.toContain("LOST");
    expect(status, output).toBe(0);
  }, 120_000);
});
