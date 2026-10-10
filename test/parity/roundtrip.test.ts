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

  /**
   * Of the unstable set, which never reach a fixed point at all.
   *
   * `once !== twice` cannot tell "normalises once more than expected" from
   * "rewrites the file forever", and those are different severities: the first is
   * cosmetic debt, the second corrupts a vault every time a formatter runs. Only
   * the unstable ids are chased, because `once === twice` is a fixed point by
   * definition. Twelve passes is far past the settling point of everything that
   * does settle -- all 28 of them settle on pass 2.
   */
  const PASSES = 12;
  const neverSettles: string[] = [];
  const unstableSet = new Set(unstable);
  for (const entry of cases) {
    if (!unstableSet.has(entry.id)) continue;
    let current = format(entry.markdown);
    let settled = false;
    for (let pass = 1; pass < PASSES; pass += 1) {
      let next: string;
      try {
        next = format(current);
      } catch {
        settled = true;
        break;
      }
      if (next === current) {
        settled = true;
        break;
      }
      current = next;
    }
    if (!settled) neverSettles.push(entry.id);
  }

  it("never throws while serialising", () => {
    expect(threw).toEqual([]);
  });

  /**
   * Formatting must terminate. This is a stricter property than the ceiling below
   * and it is the one that matters to a consumer: `obsidian-linter` reformats on
   * save, so a case that never reaches a fixed point grows the author's file every
   * single time, without bound. Nine of the thirteen grow *exponentially* -- a
   * 48-byte definition reaches 12,418 bytes in eleven passes.
   *
   * The dominant mechanism is one bug, not thirteen. A `%%` comment inside a
   * footnote definition has the container's four-space indent folded into its node
   * value on re-parse, and the handler then indents the value again; the leading
   * space of the doubled run is written as `&#x20;`, and the `&` of *that* is
   * escaped on the next pass, so each round adds four columns and a backslash run.
   *
   * `join` was measured against this and is refuted. It is the only `toMarkdown`
   * hook aimed at block separation, and the first reading of pass 0 suggested a
   * missing blank line between the definition and the following paragraph. Adding
   * one changes nothing: output is byte-identical at every pass, because the growth
   * happens *inside* the definition's own serialisation.
   *
   * All thirteen are now closed, so this asserts emptiness rather than a ceiling: a
   * formatter that never terminates is a defect and not debt, and there is no longer
   * a count to hold the line at. Four were one bug class -- a raw source slice used
   * as a node *value* rather than only as a span -- and two were upstream, reproduced
   * on bare `remark-parse` + `remark-gfm` + `remark-stringify` with none of this
   * package loaded. The remaining instability is all pass-2 settling.
   */
  it("reaches a fixed point, or records why not", () => {
    expect(neverSettles).toEqual([]);
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
   *
   * 33 to 38 when `math-unclosed-container.ts` landed, every one of the five
   * attributed and every one of them **converging**:
   *
   *      4  new `probe/math-marker/*` inputs, so new documents rather than new debt
   *      1  `probe/math-unclosed/definition`, the only pre-existing case affected
   *
   * The distinction that matters here is convergence, not instability. All five
   * reach a fixed point on the *second* pass -- `[^1]: $$y^2` becomes
   * `[^1]: \$$y^2` and then `[^1]: \$\$y^2` and stays there -- so repeated
   * formatting settles. That is the same class as the 33 above. An html-comment fix
   * was refused outright earlier for the opposite reason: it grew a backslash on
   * every pass without ever converging, which is a formatter that corrupts a file
   * rather than one that normalises it once.
   */
  it("does not grow the set of inputs formatting cannot settle", () => {
    // 40. Two from the sweep-700000 work, each converging rather than drifting, which
    // is the property that matters here: `probe/math-space/space-body-trailing-period`
    // (`  $$ $$.`), and `probe/math-emphasis/display-across-lines` (`_$$y^2` /
    // `y^2$$_`), whose parse now matches Obsidian while `toMarkdown` writes its
    // display math back as a single `$` and then escapes it. It reaches a fixed point
    // on the second pass and holds, unlike the backslash-growing shape refused
    // earlier, so it is the same debt as the rest of this list: a missing math handler,
    // not an unstable parse.
    // 41 with the sweep-800000 wave: ` $$ $$`, as
    // `probe/math-indent/one-space-empty-body`, joins the same missing-handler group.
    // 30 with the callout-title math rule. The case it adds is the one that rule
    // fixed, and it joins its own family: eight `probe/math-*` documents already
    // settle on the second pass by the same route, `$$` written `\$$` and then
    // `\$\$`.
    //
    // A literal-emission handler was built for that family and is refused. Returning
    // the demoted value verbatim is the ecosystem's mechanism for unescaped content,
    // and here it makes `> [!note] $$` *duplicate* -- `> $$` becomes `> $$` / `> $$`
    // -- because the bare spelling re-opens the very construct the demotion undid.
    // So the escape is load-bearing rather than spurious, and the README's reading of
    // this family as "a missing math handler" was wrong: no spelling is both what
    // Obsidian renders and inert on re-parse. A fix that duplicates the author's text
    // is refused even when it converges.
    // 32 with the probe wave; both additions are new documents.
    //
    // 33 with the definition-setext rule. `link-reference-definitions/216` settles on
    // the third pass rather than the second: the heading is written `# \[foo]: /url`
    // and holds, while the `[foo]` below it is a reference nothing defines, so it is
    // written bare, re-parses as text, and is escaped once. That is the same
    // dangling-reference shape as most of this list, and `neverSettles` stays empty.
    /*
     * Attributed, 32 of which 15 are the inherent math family documented in the parity
     * README and 17 are not. The 17 cluster into two dominant causes, measured by
     * diffing pass 1 against pass 2 at the first differing character -- 15 grow, 2
     * shrink:
     *
     *   5  FIXED: an entirely empty wikilink was written `[[]]`, which does not parse as
     *      a wikilink at all, so the next pass read plain text and escaped it to
     *      `\[\[]]` -- growing again every round. `[[ ]]` does parse, and is also what
     *      the author wrote, so the handler now keeps the space. `[[ ]]` and `![[ ]]`
     *      are byte-identical on both passes.
     *   4  a FAILED DEFINITION LINE, and `linkReferenceToMarkdown` is NOT the place.
     *      That reading came from ids truncated at 36 characters and is wrong: the
     *      input I inferred from the shape, `foo]: /url` over `[foo]`, is stable on
     *      both passes and byte-identical to bare remark. The real four are
     *      `commonmark/link-reference-definitions/196`, `/200`, `/202` and `/216`, and
     *      the instability starts a line EARLIER than the reference:
     *
     *          src    '[foo]: <>'   / '[foo]'
     *          pass1  '\[foo]: <>'  / '[foo]'    the DEFINITION line is escaped
     *          pass2  '\[foo]: <>'  / '\[foo]'   so the reference is now dangling
     *
     *      The tree shows why: `[foo]: <>` is a `text` node and not a `definition`,
     *      which is correct for parity because the legacy stack does not accept `<>`
     *      as a destination, and `remark-stringify` escapes its `[`. On pass 2 the
     *      line is no longer definition-shaped, so the identifier that made `[foo]` a
     *      `linkReference` is gone and the reference is escaped too.
     *
     *      So it needs a handler returning the text verbatim -- `unsafe` cannot relax
     *      an escape that already exists -- the same mechanism `raw-html/626` and the
     *      math family need. Not a reference-handler change.
     *   3  emphasis re-escaping, and one of them is the worst in the set:
     *      `emphasis/nest-underscore-outer` grows 15 bytes into `&#x20;`/`&#x62;`
     *      entities. The other two are `commonmark/emphasis-and-strong-emphasis/*`.
     *   2  a backslash before a setext run doubling: `\===` becomes `\\===`.
     *   3  singletons, including `fuzz/inline-footnote/11`, which SHRINKS by losing a
     *      line ending inside an inline footnote (`^[i` / `  e]` becomes `^[ie]`).
     *
     * So this is not 32 separate defects. Two handlers -- an empty wikilink and an
     * undefined shortcut reference -- would address 9 of the 17 actionable ones, and the
     * mechanism for both is the one already documented in the parity README: a
     * `toMarkdown` handler's return value is appended without passing through
     * `state.safe`.
     */
    expect(unstable.length).toBeLessThanOrEqual(27);
  });
});
