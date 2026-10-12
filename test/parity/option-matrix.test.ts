import fs from "node:fs";
import path from "node:path";

import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkBreaks from "remark-breaks";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import remarkObsidian from "../../src/index.js";
import { applyTextTransform } from "./chain.js";
import type { GoldenCase } from "./types.js";

/**
 * Every option toggled one at a time, against the whole corpus, looking for crashes.
 *
 * The parity gate compares two profiles. There are 24 boolean options, so it exercises two
 * points in a space of 2^24 -- and **a crash is the one failure mode the parity gate cannot
 * see**, because it only ever compares successful parses. A fuzz sweep found 55 crashes in
 * 4,000 documents once, which was the first crash any oracle here had surfaced, and nothing
 * since has watched for them outside the two configured profiles.
 *
 * Correctness is deliberately not asserted, and neither is anything else `points.test.ts`
 * already covers. There is no oracle for an arbitrary option combination -- Obsidian has no
 * such configuration -- so the only honest question left is the objective one: does it
 * throw. A first version also counted positionless nodes per configuration and was dropped:
 * `points.test.ts` gates those BY KIND for the configured profiles, which is strictly
 * stronger, and a weaker duplicate of an existing gate is worse than no gate because it
 * reads as independent confirmation.
 *
 * Single toggles rather than pairs. 24 toggles against 2 presets is 48 corpus parses and runs
 * in the time a normal gate takes; all pairs would be 1,104 and belongs in a scheduled job
 * rather than a push gate. A crash needing two options to co-occur is therefore still
 * invisible, which is worth knowing rather than implying otherwise.
 */
const goldens = path.join(import.meta.dirname, "goldens/obsidian.json");
const golden = JSON.parse(fs.readFileSync(goldens, "utf8")) as {
  cases: Record<string, GoldenCase>;
};
const markdowns = Object.values(golden.cases).map((entry) => entry.markdown);

const FLAGS = [
  "wikilinks",
  "highlights",
  "comments",
  "tags",
  "customTaskChars",
  "math",
  "taskReparse",
  "frontmatter",
  "keepComments",
  "parseComments",
  "lineOffsets",
  "bareFootnoteRefs",
  "inlineFootnotes",
  "callouts",
  "legacyEmphasis",
  "legacyStrikethrough",
  "legacyEntities",
  "legacyAutolinks",
  "legacyCodeSpans",
  "legacyLists",
  "legacyHtmlBlocks",
  "labelPrecedence",
  "positionedBreaks",
  "escapedLineBreaks",
] as const;

interface Outcome {
  readonly crashes: number;
  readonly first?: string;
}

function sweep(options: Record<string, unknown>): Outcome {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, options)
    .use(remarkBreaks);
  let crashes = 0;
  let first: string | undefined;
  for (const markdown of markdowns) {
    const source = applyTextTransform(markdown);
    try {
      processor.runSync(processor.parse(source), source);
    } catch (error) {
      crashes += 1;
      first ??= `${JSON.stringify(markdown).slice(0, 48)}: ${String(error).slice(0, 90)}`;
    }
  }
  return { crashes, first };
}

describe("option matrix", () => {
  for (const preset of ["legacy", "strict"] as const) {
    it(`never throws with any single option toggled from \`${preset}\``, () => {
      const offenders: string[] = [];
      for (const flag of FLAGS) {
        for (const value of [true, false]) {
          const result = sweep({ preset, [flag]: value });
          if (result.crashes > 0) {
            offenders.push(
              `${preset} ${flag}=${value}: ${result.crashes} crashes, first ${result.first}`,
            );
          }
        }
      }
      expect(offenders).toEqual([]);
    }, 600_000);
  }
});
