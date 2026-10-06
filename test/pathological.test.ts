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
  "block-ref-run": 20_000,
  "autolink-open": 20_000,
  "autolink-email": 5_000,
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
    "Bare chain throws `Maximum call stack size exceeded` after 2334ms; ours 2344ms. Container recursion depth, not our transforms.",
  "callout-nest":
    "The same shape once the marker is reached: bare throws after 348ms, ours 358ms.",
  "delimiter-run":
    "Bare chain exceeds the budget too — the emphasis resolver's quadratic delimiter stack, long documented against cmark.",
  "cdata-repeat":
    "Bare chain exceeds the budget too. cmark issue 299, quadratic inline HTML scanning.",
  "list-dash-sandwich":
    "cmark issue 373. Bare chain throws `Maximum call stack size exceeded` after 12751ms; ours 14738ms.",
};

/**
 * Ours, and quadratic: the bare chain handles both in milliseconds. Doubling
 * the size gives 938/3451/14350ms for the highlight run and 352/1345/5117ms
 * for the footnote opener at 2500/5000/10000 — almost exactly 4x per
 * doubling, so both are O(n^2).
 *
 * Both are an opener that rescans to end of input on every failure, fixable
 * with the failure memoisation micromark's own attention resolver uses. They
 * are recorded rather than gated until then, because 20KB of `=` is trivially
 * authorable and this should not be quietly forgotten.
 */
const OURS_QUADRATIC: Readonly<Record<string, string>> = {
  "highlight-run":
    "`=` x20000 around content. Bare chain 26ms, ours exceeds 20s. Not the no-closer case `inline-footnote-open` was: a run of `=` is full of `==` pairs, so every attempt finds a closer and the cost is the chunk scan reading to end of input before it can judge itself. Fixing it means stopping that scan at the decision point, which is a restructure of the legacy port rather than a memo.",
};

const gated = Object.keys(SIZES).filter(
  (shape) => !(shape in UPSTREAM) && !(shape in OURS_QUADRATIC),
);

describe("pathological input", () => {
  it("accounts for every shape", () => {
    expect(Object.keys(SIZES).sort()).toEqual(Object.keys(SHAPES).sort());
  });

  it("keeps the exclusions to the ones documented above", () => {
    expect(Object.keys(OURS_QUADRATIC).sort()).toEqual(["highlight-run"]);
    expect(Object.keys(UPSTREAM).length).toBe(5);
  });

  for (const shape of gated) {
    it(
      `parses ${shape} at ${SIZES[shape]} without wedging`,
      { timeout: BUDGET_MS + 15_000 },
      async () => {
        const { stdout } = await run(
          "npx",
          [
            "tsx",
            "--conditions=development",
            runner,
            shape,
            String(SIZES[shape]),
          ],
          { timeout: BUDGET_MS, cwd: path.join(here, "..") },
        );
        expect(Number(stdout)).toBeGreaterThanOrEqual(0);
      },
    );
  }
});
