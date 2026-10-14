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
import { applyTextTransform, parseOurs } from "./chain.js";
import { violationsOf } from "./invariant-checks.js";

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
 * DERIVED, never written by hand. The first version was guessed -- `isolate` and `nested`
 * left empty -- and the gate caught it instantly, which is the gate working and the author
 * not. Re-derive from the golden with the snippet in `README.md` rather than editing by eye.
 *
 * NO COUNTS IN THIS PROSE. Every axis that reached zero did so by a count in a sentence
 * going stale while `DIVERGING` below moved correctly, four separate times. The constant IS
 * the count; read it there. What prose is good for is the CAUSE of a row, which no gate can
 * infer, so that is all this says.
 *
 * SIX AXES CLEAN, and the LIVE BACKLOG IS ZERO. `inside` never diverged. `inline` closed
 * when a tag's END was found to free the caret for a block identifier. `pairs` and `matrix`
 * closed together on `linkdef > thematic`, where `definitionSetextTransform` already
 * implemented the rule and declined on NODE TYPE alone -- `===` has no second reading and
 * arrives as paragraph text while `---` arrives as a `thematicBreak`. `isolate` closed last,
 * 43 rows down to none, and all of the final eight were one family.
 *
 * WHAT CLOSED IT, worth keeping because the entries had been filed as TWO families with two
 * causes, one of them recorded as tokenizer-level work it never needed:
 *
 *   UPSTREAM SPANS THE SPACER over its continuation line. `[^1]: def` plus an indented line
 *   is ONE definition, and `<div>` plus a `%%` is ONE html node, so the third line of
 *   `container / spacer / absorbable` sits INSIDE the spacer where no absorption guard can
 *   reach it. `definitionLazySplitTransform` splits the spacer at its own line and the
 *   existing chain then decides each tail by its own node type -- which it already did
 *   correctly for all 80 cells of `--matrix`. The per-type guard was never wrong.
 *
 *   TWO THINGS THE SPLIT ALONE DID NOT GIVE. An unclosed `%%` tail needs the end of the
 *   note, which a fragment re-parse cannot know. And the head definition has to be FOLDED
 *   for a list or a quote, where Obsidian reports `defs []` against a callout's `1@1:0-1`;
 *   `footnoteInterruptTransform` performs that fold and was DECLINING, because it read
 *   adjacency from LINE numbers while this pass moves nodes by offset, leaving every line at
 *   1. The two are useless apart and were measured together.
 *
 * EVERY REMAINING ROW, and neither is work:
 *
 *     `quote > callout > footnote`  the nested definition column, confirmed over three
 *                       depths and SCORED BOTH WAYS in `score.mts` -- the general form is 0
 *                       better against 5 worse, and the measured form touches 0 of 6,818
 *                       referee documents. Declined, with the rule recorded at the early
 *                       return in `definition-column.ts` it would have to change.
 *     `comment [ ... ]` the P1 cache defect: Obsidian's offsets are short by the width of
 *                       the `%%` marker, so reproducing them would write a wrong offset into
 *                       our own tree. MUST NOT be fixed -- these four are the floor.
 */
const DIVERGING: Record<Axis, readonly string[]> = {
  pairs: [],
  matrix: [],
  inside: [],
  isolate: [],
  nested: ["quote > callout > footnote"],
  inline: [],
  "inline-block": [
    "comment [ embed ]",
    "comment [ inlinefn ]",
    "comment [ tag ]",
    "comment [ wikilink ]",
  ],
};

/**
 * The tree's own invariants, over the composition space.
 *
 * `invariants.test.ts` walked the 3,403 golden cases and nothing else, which is a limit on
 * its INPUT rather than on the check: these 1,152 sequences had never been held to it. The
 * first one examined by hand held a `footnoteDefinition` with start offset 16 and end offset
 * 15 -- a span beginning after it finishes -- which that file's first assertion tests for and
 * which passed only because the document was not in the corpus.
 *
 * Needs no Obsidian, so it gates: the checks compare the tree against ITSELF.
 *
 * MOST of these are upstream's and MUST NOT reach zero. `root > definition/heading`
 * overlapping is `UPSTREAM.md` item 2, reproducible on bare `remark-parse` + `remark-gfm`,
 * so driving it out would mean diverging from upstream's own output. The rest are ours and
 * are real defects, each named here so a fix has somewhere to land -- and two already did,
 * recorded at the boundary between the two groups below.
 *
 * No count in this sentence. The previous one said "SEVEN of the eleven" and went stale the
 * moment two of ours were fixed -- the same failure the diverging table above now avoids by
 * carrying causes and leaving counts to the constant. Read the groups below; they are the
 * record.
 */
const INVARIANT_VIOLATIONS: Record<string, readonly string[]> = {
  // UPSTREAM, keep: a definition and a setext heading built from the same lines.
  "pairs|linkdef > setext": ["SIBLINGS OVERLAP: root > definition/heading"],
  "matrix|linkdef > setext": ["SIBLINGS OVERLAP: root > definition/heading"],
  "isolate|linkdef > setext > comment": [
    "SIBLINGS OVERLAP: root > definition/heading",
  ],
  "isolate|linkdef > setext > indented": [
    "SIBLINGS OVERLAP: root > definition/heading",
  ],
  "isolate|linkdef > setext > math": [
    "SIBLINGS OVERLAP: root > definition/heading",
  ],
  "isolate|linkdef > setext > thematic": [
    "SIBLINGS OVERLAP: root > definition/heading",
  ],
  "isolate|linkdef > paragraph > thematic": [
    "SIBLINGS OVERLAP: root > definition/heading",
  ],
  // OURS: NONE. Every sequence above is upstream's, which is why there is no second group.
  //
  // All FOUR were the same defect -- a transform located a node by descending, edited it,
  // and left the nodes it had descended PAST spanning the old extent. Three passes, one
  // mistake:
  //
  //   `start AFTER end: footnoteDefinition` 16 -> 15 and `start AFTER end: text` 8 -> 7,
  //   from `lazySetextTransform` setting an end to `keepTo` without asking whether the node
  //   BEGAN at the departing line. `pruneEmptied` drops a node lying wholly past the cut,
  //   which also closed `isolate|callout > footnote > thematic` as a divergence -- Obsidian
  //   reports no definition there, so removal was its answer, not merely a repair.
  //
  //   `child ENDS AFTER parent: blockquote > list`, from the same pass shrinking only the
  //   ENDPOINTS of its descent while the helper had descended THROUGH the `list`. It is now
  //   `paragraphHostPath` and returns the whole path.
  //
  //   `child ENDS AFTER parent: listItem > paragraph`, the mirror image: a chain stretched
  //   OUTWARD over a folded definition with the `listItem` missing. `lastParagraphOf` in
  //   `footnote-interrupt.ts` now returns what it descended past, same as the above.
  //
  // THE GATE IS STRICTER NOW, not weaker, because the set is exact: ours being empty means
  // any new span defect in the composition space shows up as an unexpected key rather than
  // being absorbed into a tolerated group.
  //
  // The upstream rows MUST NOT reach zero -- see the note above the constant.
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

  it("contradicts its own spans on exactly the recorded sequences", () => {
    const found: Record<string, string[]> = {};
    for (const axis of AXES) {
      for (const entry of casesFor(axis)) {
        const source = applyTextTransform(entry.text);
        let tree;
        try {
          tree = parseOurs(source, "all-features");
        } catch {
          continue;
        }
        const bad = [...new Set(violationsOf(source, tree))].sort();
        if (bad.length > 0) found[`${axis}|${entry.name}`] = bad;
      }
    }
    expect(found).toEqual(INVARIANT_VIOLATIONS);
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
