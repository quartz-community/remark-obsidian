/**
 * `strict`'s four figures, by identity: what every `strict` change is measured against.
 *
 *   node --import tsx --conditions=development test/parity/strict-measure.mts \
 *     [--baseline test/parity/goldens/strict-measure.json] [--update] [--out <file>]
 *
 * - **spec**: the CommonMark and GFM spec examples where `strict`'s tree differs from stock
 *   `remark-parse` + `remark-gfm` (positions aside), as `strict.test.ts` gates them.
 * - **recorded**: the recorded cases (`goldens/obsidian.json`) `strict` matches, through the
 *   harness's own chain with `PARITY_PRESET=strict` (`chain.ts`'s `remarkOptions`).
 * - **definitions** and **references**: the referee documents whose footnote definitions and
 *   references `strict` reads as the referee's answers do (`referee-facts.ts`).
 *
 * It proves the preset reached the chain before reporting anything: the same recorded cases run
 * under `legacy` must give the contract's count, and `strict`'s must differ from it. A `sed`
 * patch of `chain.ts` that this replaces measured `legacy` twice without a word once the file
 * moved, which is the failure this check exists for.
 *
 * With `--baseline`, it reports each figure's gains and losses by id and exits 1 on any loss
 * (a spec divergence gained counts as a loss). `--update` rewrites the baseline, and refuses
 * while anything is lost, as `census.ts --update-baseline` does.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import remarkObsidian from "../../src/index.js";
import { loadCorpus, normalizeTree } from "./classify.js";
import { COMMONMARK_SPEC } from "./commonmark.js";
import { compareCase } from "./compare.js";
import { GFM_SPEC_EXTENSIONS } from "./gfm.js";
import { factsOf } from "./referee-facts.js";
import type { GoldenCase } from "./types.js";

interface Measure {
  spec: string[];
  recorded: string[];
  definitions: string[];
  references: string[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const baselinePath = option("--baseline");
const outPath = option("--out");
const update = args.includes("--update");

const golden = JSON.parse(
  fs.readFileSync(path.join(here, "goldens/obsidian.json"), "utf8"),
) as { oracle?: { mathTex?: boolean }; cases: Record<string, GoldenCase> };
const mathTex = golden.oracle?.mathTex ?? false;
const cases = Object.values(golden.cases);

/** The recorded cases matched under `preset`, through the harness's chain. */
const recordedUnder = (preset: "legacy" | "strict"): string[] => {
  process.env.PARITY_PRESET = preset;
  try {
    return cases
      .filter((c) => {
        try {
          return compareCase(c, mathTex).matched;
        } catch {
          return false;
        }
      })
      .map((c) => c.id);
  } finally {
    delete process.env.PARITY_PRESET;
  }
};

const log = (line: string) => process.stderr.write(`${line}\n`);

// 1. The control: the switch must reach the chain.
const legacyRecorded = recordedUnder("legacy");
const contract = cases.filter((c) => c.triage === "match").length;
const measure: Measure = {
  spec: [],
  recorded: recordedUnder("strict"),
  definitions: [],
  references: [],
};
log(
  `control: legacy matches ${legacyRecorded.length} recorded cases (contract ${contract}), ` +
    `strict ${measure.recorded.length}`,
);
if (
  legacyRecorded.length < contract ||
  measure.recorded.length === legacyRecorded.length
) {
  log(
    "strict-measure: PARITY_PRESET did not reach the chain (legacy short of the contract, or " +
      "strict equal to legacy); nothing measured",
  );
  process.exit(2);
}

// 2. The spec examples, against stock.
const stock = unified().use(remarkParse).use(remarkGfm);
const strict = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkObsidian, { preset: "strict" });
const shape = (processor: typeof stock, markdown: string): string => {
  try {
    return JSON.stringify(
      normalizeTree(processor.runSync(processor.parse(markdown), markdown)),
    );
  } catch (error) {
    return `threw: ${String(error)}`;
  }
};
for (const [id, markdown] of [...COMMONMARK_SPEC, ...GFM_SPEC_EXTENSIONS]) {
  if (shape(strict, markdown) !== shape(stock, markdown)) measure.spec.push(id);
}

// 3. The referee's footnote facts. `named` drops empty-named rows, as the referee does.
const named = (rows: ReadonlyArray<readonly unknown[]>) =>
  rows.filter((row) => row[0] !== "");
const same = (
  a: ReadonlyArray<readonly unknown[]>,
  b: ReadonlyArray<readonly unknown[]>,
) => JSON.stringify(named(a)) === JSON.stringify(named(b));
for (const document of loadCorpus()) {
  try {
    const facts = factsOf(
      strict.runSync(strict.parse(document.text), document.text) as Root,
      document.text,
    );
    if (same(facts.defs, document.defs)) {
      measure.definitions.push(document.positionalId);
    }
    if (same(facts.refs, document.refs)) {
      measure.references.push(document.positionalId);
    }
  } catch {
    // A throw agrees with nothing.
  }
}

const keys = ["spec", "recorded", "definitions", "references"] as const;
const lines = keys.map((key) => `${key} ${measure[key].length}`);
process.stdout.write(`strict: ${lines.join(", ")}\n`);
if (outPath) fs.writeFileSync(outPath, `${JSON.stringify(measure)}\n`);

// 4. Against a baseline, by identity.
if (baselinePath) {
  const before = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as Measure;
  let lost = 0;
  for (const key of keys) {
    const was = new Set(before[key]);
    const now = new Set(measure[key]);
    const gained = measure[key].filter((id) => !was.has(id));
    const dropped = before[key].filter((id) => !now.has(id));
    // A spec divergence is a cost: gaining one is the loss.
    const losses = key === "spec" ? gained : dropped;
    const gains = key === "spec" ? dropped : gained;
    lost += losses.length;
    process.stdout.write(
      `  ${key}: ${before[key].length} -> ${measure[key].length}` +
        (gains.length > 0
          ? `, +${gains.length} (${gains.slice(0, 8).join(", ")})`
          : "") +
        (losses.length > 0
          ? `, LOST ${losses.length} (${losses.slice(0, 8).join(", ")})`
          : "") +
        "\n",
    );
  }
  if (update) {
    if (lost > 0) {
      log(`strict-measure: not updating ${baselinePath}: ${lost} lost`);
    } else {
      fs.writeFileSync(baselinePath, `${JSON.stringify(measure, null, 1)}\n`);
      log(`baseline written: ${baselinePath}`);
    }
  }
  process.exitCode = lost > 0 ? 1 : 0;
}
