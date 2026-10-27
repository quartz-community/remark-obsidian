import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { SHAPES } from "./pathological/shapes.js";

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(here, "pathological", "parse-once.ts");

/**
 * A ceiling, not a benchmark. Shared runners are far too noisy to gate on
 * milliseconds, so this asserts only that a parse *finishes* — which is what
 * separates a linear path from a quadratic one at these sizes. Every gated
 * shape completes well inside five seconds locally.
 */
const BUDGET_MS = 20_000;

const SIZES: Readonly<Record<string, number>> = {
  "nested-brackets": 10_000,
  "nested-blockquotes": 25_000,
  "nested-lists": 500,
  "unclosed-links": 15_000,
  "unclosed-comment": 50_000,
  "delimiter-run": 20_000,
  "list-dash-sandwich": 7_000,
  "cdata-repeat": 10_000,
  "wikilink-open": 20_000,
  "highlight-run": 20_000,
  "comment-open": 20_000,
  "math-open": 20_000,
  "inline-footnote-open": 20_000,
  "callout-nest": 10_000,
  "tag-run": 20_000,
  "table-pipes": 5_000,
  "footnote-refs": 20_000,
  "bracket-close-run": 30_000,
  "block-ref-run": 20_000,
  "autolink-open": 20_000,
  "autolink-email": 5_000,
  "backtick-run": 20_000,
  "backtick-retry": 7_000,
  "backtick-increasing": 2_000,
};

/**
 * Shapes stock `remark-parse` + `remark-gfm` already fails on, measured both
 * with and without this plugin. Gating them would assert something this
 * package cannot fix: the container recursion depth and the emphasis resolver
 * belong upstream. Each entry records what the bare chain does, so the claim
 * stays checkable rather than becoming folklore.
 */
const UPSTREAM: Readonly<Record<string, string>> = {
  "nested-blockquotes":
    "remark-parse 8 recurses per quote and throws `Maximum call stack size exceeded` within a second; the bare micromark chain throws too, after 2.3s.",
  "callout-nest":
    "The same shape once the marker is reached: remark-parse 8 throws within a second.",
  "delimiter-run":
    "remark-parse 8 throws `Maximum call stack size exceeded` within a second; the bare micromark chain exceeds the budget -- the emphasis resolver's quadratic delimiter stack, long documented against cmark.",
  "list-dash-sandwich":
    "cmark issue 373. remark-parse 8 throws `Maximum call stack size exceeded` within a second; the bare micromark chain after 12.8s.",
};

/**
 * Shapes this package was quadratic on, now gated.
 *
 * `highlight-run` was the last entry and is fixed. The decision function needed
 * four characters to reject `=` x20000 -- a closer sitting on the opener has empty
 * content -- while the chunk scan behind it read to end of input first, once per
 * opener. Bounding that scan at the two conditions the decider already treats as
 * final took 2500/5000/10000 from 938/3451/14350ms to 45/43/76ms, and 20000 from
 * over 20s to 149ms: ~1.96x per doubling against the ~4x that defined the curve.
 *
 * Kept as an empty record rather than deleted so the assertion below still names
 * the invariant, and so the next shape that regresses has somewhere to be recorded.
 */
const OURS_QUADRATIC: Readonly<Record<string, string>> = {};

const gated = Object.keys(SIZES).filter(
  (shape) => !(shape in UPSTREAM) && !(shape in OURS_QUADRATIC),
);

/**
 * Shapes the stock micromark chain fails on, beyond `UPSTREAM`, which `strict` parses with.
 * `legacy` parses with remark-parse 8 and passes them.
 */
const STRICT_UPSTREAM: Readonly<Record<string, string>> = {
  "cdata-repeat":
    "Bare remark-parse + remark-gfm exceeds the budget: cmark issue 299, quadratic inline HTML scanning. remark-parse 8 takes 243ms, so `legacy` is gated on it.",
  "backtick-increasing":
    "Bare remark-parse + remark-gfm takes 2.0s at 500, 16.2s at 1,000 and 130s at 2,000: micromark's code-span scan, cubic on runs of growing length.",
};

const strictGated = gated.filter((shape) => !(shape in STRICT_UPSTREAM));

async function parseOnce(shape: string, preset: "legacy" | "strict") {
  const { stdout } = await run(
    "npx",
    [
      "tsx",
      "--conditions=development",
      runner,
      shape,
      String(SIZES[shape]),
      preset,
    ],
    { timeout: BUDGET_MS, cwd: path.join(here, "..") },
  );
  return Number(stdout);
}

describe("pathological input", () => {
  it("accounts for every shape", () => {
    expect(Object.keys(SIZES).sort()).toEqual(Object.keys(SHAPES).sort());
  });

  it("keeps the exclusions to the ones documented above", () => {
    expect(Object.keys(OURS_QUADRATIC).sort()).toEqual([]);
    expect(Object.keys(UPSTREAM).length).toBe(4);
    expect(Object.keys(STRICT_UPSTREAM).sort()).toEqual([
      "backtick-increasing",
      "cdata-repeat",
    ]);
  });

  for (const shape of gated) {
    it(
      `parses ${shape} at ${SIZES[shape]} without wedging`,
      { timeout: BUDGET_MS + 15_000 },
      async () => {
        expect(await parseOnce(shape, "legacy")).toBeGreaterThanOrEqual(0);
      },
    );
  }

  // The four `UPSTREAM` shapes are no hang under `legacy`: remark-parse 8 overflows its stack
  // within a second, so a pathological note fails fast instead of stalling a build. Asserted
  // here so that a change turning a fast failure into a hang cannot pass unseen.
  for (const shape of Object.keys(UPSTREAM)) {
    it(
      `terminates on ${shape} at ${SIZES[shape]} under legacy`,
      { timeout: BUDGET_MS + 15_000 },
      async () => {
        const outcome = await parseOnce(shape, "legacy").then(
          () => "parsed",
          (error: { killed?: boolean; stderr?: string }) =>
            error.killed
              ? "timed out"
              : /Maximum call stack size exceeded/u.test(error.stderr ?? "")
                ? "threw"
                : `failed: ${error.stderr ?? ""}`,
        );
        expect(["parsed", "threw"]).toContain(outcome);
      },
    );
  }

  for (const shape of strictGated) {
    it(
      `parses ${shape} at ${SIZES[shape]} under strict without wedging`,
      { timeout: BUDGET_MS + 15_000 },
      async () => {
        expect(await parseOnce(shape, "strict")).toBeGreaterThanOrEqual(0);
      },
    );
  }
});
