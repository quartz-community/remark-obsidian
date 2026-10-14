import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  agrees,
  AXES,
  casesFor,
  oursFor,
  type Axis,
  type Facts,
} from "./compose.js";

/**
 * The composition axes, gated.
 *
 * These seven axes produced nearly every fix of the last several sessions -- the list/quote
 * asymmetry class, the callout indented-code lift, the nested comment recursion, the
 * lazy-setext depth bug, the inline-closer block-id rule -- and they had NO committed
 * expectation at all. `35 of 1152` was reproducible on demand, which means a regression in
 * the most productive dimension here was silent until somebody thought to re-run a sweep.
 *
 * This closes that with the pattern the main parity gate already uses. The gate is
 * authoritative despite needing Obsidian because the app's answers are COMMITTED and our side
 * is recomputed in CI; `goldens/compose.json` does the same for composition, so this file
 * needs no Obsidian, no vault and no plugin. Re-record with
 * `compose.mts --record` when Obsidian's own answers change.
 *
 * Held as an EXACT per-axis set rather than a count, for the reason `roundtrip.test.ts`
 * records: a bound absorbs regressions up to its limit, and it also hides every fix, so the
 * number and its attribution drift apart. An exact set makes an improvement fail too, which
 * forces both to move together.
 */
const GOLDEN = path.join(import.meta.dirname, "goldens/compose.json");

/**
 * The sequences that diverge, by axis, every one attributed.
 *
 *     inline-block  all four are the P1 cache defect: Obsidian's offsets are short by the
 *                   width of the `%%` marker, so reproducing them would write a wrong offset
 *                   into our own tree. MUST NOT be fixed.
 *     isolate       the 19 are the same four absorbable families the matrix names, seen
 *                   through a spacer; `comment` and `math` dominate.
 *     `linkdef > indented` WAS here and is fixed -- an indented line after a link reference
 *     definition is code, which `definitionIndentedCodeTransform` now reproduces. The gate
 *     is what forced this list to move with the fix rather than drifting behind it.
 *
 *     The MATH EXTENT family is closed -- `mathListExtentTransform` bounds an unclosed `$$`
 *     at its blank line when a list absorbs it, which took 12 rows across four axes. The two
 *     The two `> footnote > math` rows closed too, by walking the opener's chain back to the
 *     list across a `footnoteDefinition` -- the only spacer that survives as its own root
 *     sibling, since the rest are absorbed into the item's lazy paragraph first.
 *
 *     pairs/matrix  `linkdef > thematic` is -- both sides absorb the
 *                   opener and we run past the blank line, which is upstream in remark-math
 *                   and needs node surgery rather than a guard. `linkdef > indented` reports
 *                   a paragraph where Obsidian reports code; `linkdef > thematic` is
 *                   upstream's setext-under-definition reading, `UPSTREAM.md` item 2.
 *     nested        two `nested > math` are the same extent bug; `quote > callout > footnote`
 *                   is a definition column, 2 against our 0.
 *     DERIVED, not written by hand. The first version of this table was guessed -- `isolate`
 *     and `nested` were left empty -- and the gate caught it immediately, which is the gate
 *     working and the author not. Re-derive it from the golden rather than editing it by eye.
 *
 *     inline        `#tag^blk` only: a tag has no closing delimiter, so the caret follows a
 *                   word character, which is a different mechanism from the closer rule and
 *                   needs its own evidence.
 *
 * WHAT THE REMAINING 19 ARE, each with its cause measured rather than guessed:
 *
 *     5 `> comment`      the `%%` never becomes a comment node. `- item` / `[^1]: def` /
 *                        `%%` arrives as ONE paragraph with `%%` as a TEXT child, both lines
 *                        absorbed as lazy continuation, so there is nothing to lift. Needs
 *                        `%%` to interrupt lazy continuation -- tokenizer-level, not a guard.
 *     2 `html > thematic` we absorb the `---` into the container where Obsidian keeps a root
 *                        `thematicBreak`. The chain widening that would do it is recorded at
 *                        3 better against 23 worse in `container-lazy.ts`.
 *     2 `footnote > indented` and 1 `footnote > thematic`: a definition absorbed as a
 *                        container's lazy content is NOT a definition to Obsidian, so the
 *                        indented line after it is root `code` rather than the definition's
 *                        continuation. `callout > footnote > thematic` is the same cause seen
 *                        through `defs`: Obsidian reports none and we report one.
 *     1 `quote > callout > footnote`  a definition column, confirmed over three depths; the
 *                        rule and why it is not implemented are recorded in
 *                        `definition-column.ts` at the early return it would have to change.
 *     1 `tag + blockid`  a tag has no closing delimiter, so the caret follows a word
 *                        character -- a different mechanism from the closer rule.
 *     1 `linkdef > thematic`  upstream's setext-under-definition reading, `UPSTREAM.md` 2.
 *     4 `comment [ ... ]` the P1 cache defect. MUST NOT be fixed.
 */
const DIVERGING: Record<Axis, readonly string[]> = {
  pairs: ["linkdef > thematic"],
  matrix: ["linkdef > thematic"],
  inside: [],
  isolate: [
    "bullet > footnote > comment",
    "bullet > html > comment",
    "bullet > html > thematic",
    "callout > footnote > comment",
    "callout > footnote > indented",
    "callout > footnote > thematic",
    "ordered > footnote > comment",
    "ordered > html > comment",
    "ordered > html > thematic",
    "quote > footnote > comment",
    "quote > footnote > indented",
  ],
  nested: ["quote > callout > footnote"],
  inline: ["tag + blockid"],
  "inline-block": [
    "comment [ embed ]",
    "comment [ inlinefn ]",
    "comment [ tag ]",
    "comment [ wikilink ]",
  ],
};

const golden = fs.existsSync(GOLDEN)
  ? (JSON.parse(fs.readFileSync(GOLDEN, "utf8")) as {
      obsidian: { app: string | null };
      recordedAt: string;
      axes: Record<string, Record<string, Facts>>;
    })
  : undefined;

describe.skipIf(golden === undefined)("composition axes", () => {
  const file = golden!;

  it("covers every axis the library enumerates", () => {
    // A golden missing an axis would make that axis silently ungated again, which is the
    // exact state this file exists to leave behind.
    expect(Object.keys(file.axes).sort()).toEqual([...AXES].sort());
  });

  it("records an answer for every sequence", () => {
    const missing: string[] = [];
    for (const axis of AXES) {
      for (const entry of casesFor(axis)) {
        if (!(entry.name in (file.axes[axis] ?? {}))) {
          missing.push(`${axis}: ${entry.name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  for (const axis of AXES) {
    it(`diverges on exactly the recorded sequences for \`${axis}\``, () => {
      const answers = file.axes[axis] ?? {};
      const diverging: string[] = [];
      for (const entry of casesFor(axis)) {
        const want = answers[entry.name];
        if (want === undefined) continue;
        let got: Facts;
        try {
          got = oursFor(entry.text, axis);
        } catch {
          diverging.push(`${entry.name} THREW`);
          continue;
        }
        if (!agrees(want, got)) diverging.push(entry.name);
      }
      expect(diverging.sort()).toEqual([...DIVERGING[axis]].sort());
    });
  }
});
