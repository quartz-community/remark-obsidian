/**
 * Whether a fresh recording of `goldens/obsidian.json` differs from the committed one in
 * anything but `recordedAt`. Exits 0 when it does not.
 *
 * Every recording stamps a new `recordedAt`, so `git diff` alone reports drift on every run
 * whether or not Obsidian answered differently. The weekly parity job restores the committed
 * file when this exits 0, so only a recording whose cases, app version, oracle or chain moved
 * counts as drift.
 *
 *     npx tsx test/parity/goldens-unchanged.mts
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = path.join(here, "goldens", "obsidian.json");

const withoutStamp = (text: string): string => {
  const file = JSON.parse(text) as Record<string, unknown>;
  delete file.recordedAt;
  return JSON.stringify(file);
};

const committed = execFileSync(
  "git",
  ["show", "HEAD:./goldens/obsidian.json"],
  {
    cwd: here,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  },
);
const same =
  withoutStamp(committed) === withoutStamp(fs.readFileSync(golden, "utf8"));

console.log(
  same
    ? "goldens/obsidian.json: unchanged apart from recordedAt"
    : "goldens/obsidian.json: the recording differs",
);
process.exitCode = same ? 0 : 1;
