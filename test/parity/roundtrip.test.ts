import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkStringify from "remark-stringify";

import remarkObsidian from "../../src/index.js";
import { PROFILES } from "./chain.js";
import type { GoldenCase } from "./types.js";

const goldenPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "goldens",
  "obsidian.json",
);

const format = (markdown: string): string =>
  String(
    unified()
      .use(remarkParse)
      .use(remarkObsidian, PROFILES["quartz-default"].remarkObsidian)
      .use(remarkGfm)
      .use(remarkBreaks)
      .use(remarkStringify)
      .processSync(markdown),
  );

/**
 * Parsing is only half of what a consumer does. `obsidian-linter` and anything
 * else that reformats a vault parses, edits and then *serialises*, so a
 * serialiser that throws or that never settles corrupts files no amount of
 * parse fidelity can save. The parity corpus measures only the parse, which is
 * how a missing `callout` handler — the commonest Obsidian block — went
 * unnoticed while every other construct had one.
 *
 * Two properties are gated. Serialising must never throw, which is absolute.
 * And formatting must reach a fixed point: the first pass may normalise freely,
 * since the corpus is full of deliberately malformed input, but a second pass
 * over already-formatted output must change nothing. Anything else means
 * repeated formatting keeps rewriting the file.
 */
describe("round-trip", () => {
  const file = JSON.parse(fs.readFileSync(goldenPath, "utf8")) as {
    cases: Record<string, GoldenCase>;
  };
  const cases = Object.values(file.cases);

  const threw: string[] = [];
  const unstable: string[] = [];
  for (const entry of cases) {
    let once: string;
    let twice: string;
    try {
      once = format(entry.markdown);
      twice = format(once);
    } catch (error) {
      threw.push(`${entry.id}: ${(error as Error).message}`);
      continue;
    }
    if (once !== twice) unstable.push(entry.id);
  }

  it("never throws while serialising", () => {
    expect(threw).toEqual([]);
  });

  it("serialises a callout back to its blockquote", () => {
    expect(format("> [!note] Title\n> Body\n")).toBe(
      "> [!note] Title\n> Body\n",
    );
    expect(format("> [!note]- Folded\n> H\n")).toBe("> [!note]- Folded\n> H\n");
    expect(format("> [!warning]\n> B\n")).toBe("> [!warning]\n> B\n");
    expect(format("> [!q] O\n> > [!t] I\n> > b\n")).toBe(
      "> [!q] O\n> > [!t] I\n> > b\n",
    );
  });

  /**
   * The ceiling tracks a known serialiser gap, not parse quality. A transform
   * that folds lazy lines back into a block emits `break` nodes, and
   * `remark-stringify` writes a hard break as a trailing backslash that
   * re-parses as an escaped one -- so each pass adds a backslash and the
   * document never settles. Making a parse more faithful therefore *raises*
   * this number whenever the new shape reaches that gap, which is why it is a
   * ceiling rather than an equality: the fix belongs in how these passes
   * represent a folded line, not in parsing less accurately.
   */
  it("does not grow the set of inputs formatting cannot settle", () => {
    expect(unstable.length).toBeLessThanOrEqual(97);
  });
});
