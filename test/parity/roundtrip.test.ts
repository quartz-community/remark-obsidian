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
      // `remarkGfm` before `remarkObsidian`, as `chain.ts` pins it. This processor
      // had the old order, so every measurement here was taken against a chain
      // Quartz does not use -- and for `toMarkdown` it matters doubly, since the
      // later extension's handlers win and gfm was overriding ours.
      .use(remarkGfm)
      .use(remarkObsidian, PROFILES["quartz-default"].remarkObsidian)
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

  it.each([
    ["a line break", "a\nb\n", "a\nb\n"],
    ["one inside a highlight", "==a\nb==\n", "==a\nb==\n"],
    ["one inside strong", "**a\nb**\n", "**a\nb**\n"],
    [
      "an aliased wikilink in a cell",
      "| L |\n| --- |\n| [[N\\|A]] |\n",
      "[[N\\|A]]",
    ],
  ])("round-trips %s", (_name, markdown, expected) => {
    const once = format(markdown);
    expect(once).toContain(expected);
    expect(format(once)).toBe(once);
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
   *
   * The thirty-fifth is not ours at all. `a@b_c.com` holds an underscore, which
   * GFM's literal autolink accepts while an angle-bracket autolink does not, so
   * `<a@b_c.com>` parses as a link with the brackets left beside it as text --
   * and `remark-stringify` then writes the link back in its `<...>` shorthand,
   * adding a pair every pass:
   *
   *     write a@b_c.com now
   *     write <a@b_c.com> now
   *     write <<a@b_c.com>> now
   *
   * Measured both ways: `remark-parse` + `remark-gfm` + `remark-stringify`
   * grows identically with this package absent, and dropping `remark-gfm`
   * settles it. So it is an upstream interaction worth reporting rather than
   * something to work around here.
   */
  /**
   * The thirty-sixth is `labelPrecedence` reaching that gap, as the paragraph above
   * predicts it would. `[a<https://e.test/?q=]>b](u)` is entirely literal text to
   * Obsidian -- the `]` inside the autolink closes the label and nothing opens after
   * it -- so the faithful tree is one `text` node holding the whole run. Serialising
   * that needs `\[`, `\<` and `\(` escapes, and re-parsing them does not return
   * the same tree.
   *
   * The parse is right and is checked by the parity gate; it is the representation
   * of literal text that cannot survive a round trip, which is the same gap the
   * `break` nodes above hit.
   */
  /**
   * Thirty-seven to thirty-nine are three harvested fuzz clusters, and they move the
   * ceiling for a different reason than the two above: the parse did not change, the
   * corpus did. `[^1]:` / blank / `---` serialises to `[^1]:` with the thematic break
   * gone, so the second pass has nothing to drop and settles somewhere else.
   *
   * Both reasons are legitimate and neither is a parse regression -- all three are
   * `replicate` cases where the parse is already known to diverge -- but they are
   * worth telling apart when this number next moves. A more faithful parse reaching
   * the serialiser gap is progress; a new case reaching it is only coverage.
   */
  /**
   * Thirty-three, and it was thirty-five before tonight -- a more faithful parse
   * lowered it, which has not happened before.
   *
   * It read sixty-nine for a while, and both halves of that were artefacts. This
   * processor had `remarkObsidian` before `remarkGfm`, against the order `chain.ts`
   * pins, so every measurement here was taken on a chain Quartz does not use -- and
   * for `toMarkdown` that decides which extension's handlers win, so gfm was
   * overriding ours. And `footnote-reference-to-markdown.ts` did not exist, so a
   * label holding a `[` was written back escaped, re-parsed to a different label and
   * grew a backslash every pass.
   *
   * What remains is **not** the `break` gap, which is what this docstring claimed
   * before the thirty-three were classified. Measured by shape:
   *
   *     11  other
   *      9  leading indent re-encoded as `&#x20;`
   *      8  wikilink or bracket run that does not re-parse to the same node
   *      4  emphasis delimiter ambiguity
   *      1  gfm's literal autolink, upstream and documented above
   *
   * No single cause dominates, and each needs its own `toMarkdown` handler. The
   * wikilink eight are ours and the clearest: `path` is deliberately the *resolved*
   * target, so `[[ ]]` carries an empty one and writes back as `[[]]`, which parses
   * as no wikilink at all -- and `[[target\]]` loses the backslash `value` keeps.
   * Fixing those means the node carrying what to serialise alongside what to resolve
   * and what to render, which is a third field and a staleness question.
   *
   * Left as tracked debt rather than chased handler by handler. This is a ceiling,
   * the parity gate is the contract, and nothing here throws.
   */
  it("does not grow the set of inputs formatting cannot settle", () => {
    expect(unstable.length).toBeLessThanOrEqual(33);
  });
});
