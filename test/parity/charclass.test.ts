import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { disagreement, ourFacts, TEMPLATES } from "./fuzz/charclass.js";
import type { ComputedMeta } from "./types.js";

/**
 * Character classes against Obsidian's recorded answers, on every push.
 *
 * `goldens/charclass.json` holds what Obsidian's `metadataCache` reported for one character at a
 * time in a slot of each construct whose reading depends on the character -- a tag, a block id,
 * a footnote label, a wikilink and an embed target, a callout type, a task box -- for printable
 * ASCII, every kind of whitespace, both sides of the punctuation-block boundaries and a sample
 * of every Unicode category: 232 characters in 8 templates. Recorded by
 * `fuzz/charclass-sweep.ts 0 --save`, which runs nightly over a fresh random sample.
 *
 * Its first run found five rules no generated document could reach: tag characters (issue #1),
 * a task box being ONE UTF-16 unit that is not a line terminator, NFC on a link's resolved
 * target, U+2028/U+2029 ending a wikilink, and footnote labels matched lowercased rather than
 * case-folded. Compared EXACTLY under legacy, on lines under strict, as `strict-syntax` does.
 */
interface Answer {
  readonly template: string;
  readonly c: string;
  readonly obsidian: Partial<ComputedMeta>;
}

const golden = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "goldens/charclass.json"),
    "utf8",
  ),
) as { answers: Answer[] };

describe("character classes", () => {
  it("records every template", () => {
    expect(new Set(golden.answers.map((answer) => answer.template))).toEqual(
      new Set(TEMPLATES.map((template) => template.name)),
    );
    expect(golden.answers.length).toBeGreaterThan(1500);
  });

  for (const preset of ["legacy", "strict"] as const) {
    it(`reads every recorded character as Obsidian does, under ${preset}`, () => {
      const wrong: string[] = [];
      for (const answer of golden.answers) {
        const template = TEMPLATES.find((t) => t.name === answer.template)!;
        const markdown = template.build(answer.c);
        const diff = disagreement(
          template,
          answer.obsidian as ComputedMeta,
          ourFacts(markdown, preset),
          preset,
        );
        if (diff.length > 0) {
          const point = [...answer.c]
            .map((u) => `U+${u.codePointAt(0)!.toString(16).toUpperCase()}`)
            .join(" ");
          wrong.push(`${answer.template} ${point}: ${diff.join("; ")}`);
        }
      }
      expect(wrong).toEqual([]);
    });
  }
});
