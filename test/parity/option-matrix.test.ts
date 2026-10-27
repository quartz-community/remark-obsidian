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
 * Single toggles rather than pairs. 15 toggles against 2 presets is 30 corpus parses and runs
 * in the time a normal gate takes; all pairs would be 420 and belongs in a scheduled job
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
  "frontmatter",
  "keepComments",
  "parseComments",
  "lineOffsets",
  "bareFootnoteRefs",
  "inlineFootnotes",
  "callouts",
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

  /**
   * The PAIR sweep, behind `PARITY_OPTION_PAIRS=1`.
   *
   * The docstring above records that a crash needing two options to co-occur is invisible to
   * the single-toggle sweep, and says all pairs "belongs in a scheduled job". That left the
   * axis unmeasured with a note explaining why -- which these notes classify as a tripwire
   * rather than an answer, so it is now runnable.
   *
   * Both flags are turned OFF together, which is the direction that removes a pass: an option
   * defaulting on and cleared leaves whatever it was repairing unrepaired, and two such gaps
   * at once is the combination the single sweep cannot reach. Turning pairs ON cannot expose
   * a missing-pass interaction, since `all-features` already has everything on and is swept
   * every push.
   *
   * 24 choose 2 is 276 pairs against each preset, and each pair parses the whole corpus --
   * minutes rather than seconds, which is why it is opt-in rather than a push gate. The
   * `SCOPE` entry in `overview.ts` names this variable, so the two must stay in step.
   */
  const pairsWanted = process.env.PARITY_OPTION_PAIRS === "1";
  it.skipIf(!pairsWanted)(
    "never throws with any PAIR of options cleared",
    () => {
      const offenders: string[] = [];
      for (const preset of ["legacy", "strict"] as const) {
        for (let i = 0; i < FLAGS.length; i++) {
          for (let j = i + 1; j < FLAGS.length; j++) {
            const options = {
              preset,
              [FLAGS[i]!]: false,
              [FLAGS[j]!]: false,
            };
            const result = sweep(options);
            if (result.crashes > 0) {
              offenders.push(
                `${preset} ${FLAGS[i]}=false ${FLAGS[j]}=false: ${result.crashes} crashes, first ${result.first}`,
              );
            }
          }
        }
      }
      expect(offenders).toEqual([]);
    },
    3_600_000,
  );
});
