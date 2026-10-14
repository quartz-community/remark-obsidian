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
 * NO COUNTS IN THIS PROSE. Four axes have reached zero (`pairs`, `matrix`, `inside`,
 * `inline`) and each did so by a count in a sentence going stale while `DIVERGING` below
 * moved correctly. The constant IS the count; read it there. What prose is good for is the
 * CAUSE of a row, which no gate can infer, so that is all this says.
 *
 * FOUR AXES CLEAN. `inside` never diverged. `inline` closed when a tag's END was found to
 * free the caret for a block identifier. `pairs` and `matrix` closed together on their last
 * shared row, `linkdef > thematic`, whose cause is worth keeping: `definitionSetextTransform`
 * already implemented the rule and declined this case on NODE TYPE alone, because `===` has
 * no second reading and arrives as paragraph text while `---` arrives as a `thematicBreak`.
 * One rule, two node types -- the same shape as `splitLazyHtml` beside `splitLazyHeading`.
 *
 * EVERY REMAINING ROW, each with its cause measured rather than guessed:
 *
 *     `> comment`       the `%%` never becomes a comment node. `- item` / `[^1]: def` /
 *                       `%%` arrives as ONE paragraph with `%%` as a TEXT child, both lines
 *                       absorbed as lazy continuation, so there is nothing to lift. Needs
 *                       `%%` to interrupt lazy continuation -- tokenizer-level, not a guard.
 *     `footnote > indented` and `footnote > thematic`: a definition absorbed as a
 *                       container's lazy content is NOT a definition to Obsidian, so the
 *                       indented line after it is root `code` rather than the definition's
 *                       continuation. `callout > footnote > thematic` is the same cause seen
 *                       through `defs`: Obsidian reports none and we report one. Closing it
 *                       means surgery in `containerLazyTransform`'s `footnoteDefinition`
 *                       absorption, which 43 referee documents depend on.
 *     `quote > callout > footnote`  a definition column, confirmed over three depths; the
 *                       rule and why it is not implemented are recorded in
 *                       `definition-column.ts` at the early return it would have to change.
 *     `comment [ ... ]` the P1 cache defect: Obsidian's offsets are short by the width of
 *                       the `%%` marker, so reproducing them would write a wrong offset into
 *                       our own tree. MUST NOT be fixed -- these four are the floor.
 */
const DIVERGING: Record<Axis, readonly string[]> = {
  pairs: [],
  matrix: [],
  inside: [],
  isolate: [
    "bullet > footnote > comment",
    "bullet > html > comment",
    "callout > footnote > comment",
    "callout > footnote > indented",
    "ordered > footnote > comment",
    "ordered > html > comment",
    "quote > footnote > comment",
    "quote > footnote > indented",
  ],
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
  // OURS. Both involve a list absorbed into a container, the same family the diverging-row
  // table above attributes.
  //
  // The two NEGATIVE-SPAN defects that used to sit here are FIXED. `lazySetextTransform` set
  // a node's end to `keepTo` without checking whether the node began at the line that was
  // leaving, so `footnoteDefinition` came out 16 -> 15 and `text` 8 -> 7. `pruneEmptied`
  // drops a node lying wholly past the cut instead, which also closed
  // `isolate|callout > footnote > thematic` as a divergence -- Obsidian reports no
  // definition there, so removing the node was its answer and not merely a repair.
  "nested|quote > bullet > footnote": [
    "child ENDS AFTER parent: listItem > paragraph",
  ],
  "nested|quote > bullet > setext": [
    "child ENDS AFTER parent: blockquote > list",
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
