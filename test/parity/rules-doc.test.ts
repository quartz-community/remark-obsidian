import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { visit } from "unist-util-visit";

import { applyTextTransform, parseOurs } from "./chain.js";
import { computeOurs } from "./normalize.js";

/**
 * Their rules document, as a gate.
 *
 * `docs/obsidian-reading-rules.md` in `obsidian-footnotes` states Obsidian's reading rules in
 * lettered sentences with worked examples, derived clean-room against the same application
 * this harness measures. Mining it has twice been worth more per example than anything
 * generated here: the first pass found five gaps and this one found five more, four of them
 * shapes the 3,403-case corpus holds ZERO instances of.
 *
 * So the examples are committed with Obsidian's own answers beside them and recomputed here
 * with no Obsidian needed, exactly as `compose.test.ts` does for the composition axes. What
 * this adds over the corpus is not a new oracle but a new INPUT SET -- one chosen by someone
 * else, against the same application, which is why it finds what our own generator cannot.
 *
 * WHY NOT `corpus.ts`. These shapes belong there eventually, and putting them there needs a
 * recording run: a new case arrives `unreviewed`, the main gate fails until it is triaged, and
 * `parity:record` rewrites all 3,403 goldens. The project's own workflow says a golden change
 * is a behaviour change that a human adjudicates -- the scheduled job never commits one. A
 * separate golden recorded through `ask.mts` costs none of that and gates the same facts, so
 * this file is the cheap half and promotion to `corpus.ts` is still owed.
 *
 * WHAT IS COMPARED, and why it is narrower than the main gate: footnote definitions and
 * references with their full positions, the block-identifier index, and the source-backed
 * section starts. Those are what the document's rules are ABOUT. `text` is deliberately not
 * compared -- several of these examples turn on rendering, and the recorder's `.footnotes`
 * removal has no equivalent in `ask.mts`'s raw cache read.
 *
 * TWO CAVEATS THAT INVALIDATE A RESULT SILENTLY, both of which cost a wrong reading while this
 * was being built:
 *
 *   `footnoteRefs` lists ONLY references whose name HAS a definition. Comparing every
 *   `footnoteReference` node in our tree against it reports a divergence for every dangling
 *   one -- three of the first four "failures" here were that, not parity. Our side therefore
 *   filters to defined names, which is the same thing the field does.
 *
 *   Obsidian's `sections` carry ZERO-LENGTH `text`/`element` entries past the end of the
 *   document, for the relocated footnote list. They are not source blocks; the golden drops
 *   them when recording, as `sourceBacked` does in `compute.test.ts`.
 *
 * Also recorded because it is the one field shaped unlike its siblings: `blocks` is a RECORD
 * keyed by identifier, not an array.
 */
const GOLDEN = path.join(import.meta.dirname, "goldens", "rules-doc.json");

interface Entry {
  readonly id: string;
  readonly start: { line: number; col: number; offset: number };
}

interface Case {
  readonly rule: string;
  readonly markdown: string;
  readonly obsidian: {
    readonly footnotes: readonly Entry[];
    readonly footnoteRefs: readonly Entry[];
    readonly blocks: readonly string[];
    readonly referenceLinks?: readonly string[];
    readonly sections: ReadonlyArray<{ type: string; start: number }>;
  };
}

/**
 * Obsidian counts lines and columns from ZERO; mdast counts both from one.
 *
 * Offsets are the same on both sides and are included, which is what makes this a position
 * comparison rather than a line one -- the audit that produced this golden first compared
 * `name@line` only, and the one case that differs on COLUMN alone is `P2`, where Obsidian's
 * cache is wrong and we are right.
 */
const key = (
  id: string,
  start: { line: number; column?: number; offset?: number },
) =>
  `${id}@${(start.line ?? 1) - 1}:${(start.column ?? 1) - 1}+${start.offset}`;

const obsKey = (entry: Entry) =>
  `${entry.id}@${entry.start.line}:${entry.start.col}+${entry.start.offset}`;

function oursFor(markdown: string) {
  const source = applyTextTransform(markdown);
  const tree = parseOurs(source, "all-features");
  const footnotes: string[] = [];
  const refs: string[] = [];
  visit(tree, (node: unknown) => {
    const self = node as {
      type: string;
      identifier?: string;
      position?: { start: { line: number; column?: number; offset?: number } };
    };
    if (!self.position) return;
    if (self.type === "footnoteDefinition") {
      footnotes.push(key(self.identifier ?? "", self.position.start));
    }
    if (self.type === "footnoteReference") {
      refs.push(key(self.identifier ?? "", self.position.start));
    }
  });
  const defined = new Set(footnotes.map((entry) => entry.split("@")[0]));
  return {
    footnotes: footnotes.sort(),
    footnoteRefs: refs
      .filter((entry) => defined.has(entry.split("@")[0]))
      .sort(),
  };
}

/**
 * The examples we do not yet reproduce, every one attributed.
 *
 * DERIVED, never written by hand -- the same rule the composition gate carries, for the same
 * reason. Each entry names the document's rule letter and what the difference is. Obsidian was
 * asked directly for all five, and it sided with their document every time, so these are OURS
 * and the document is not wrong about any of them.
 *
 *   B10  `- apples` / `[^1]: x` / `- pears` is ONE list to Obsidian, because the label is the
 *        first item's lazy text and the list therefore never ended. We report two lists.
 *
 *   C2   `a | b` / `--- | ---` / `⟨4sp⟩| c[^2] | d` keeps the indented line as a ROW, because
 *        a pipeless table's rows do not start with `|` in the first place. We make it indented
 *        code, so the reference inside it is dead where Obsidian has it live. The PIPED half
 *        of C2 is fixed -- see `table-indented-row.ts`.
 *
 *   D6   `[foo]: /url` / blank / `'tit [^1]` / `le'` reads the title across the blank line, so
 *        the `[^1]` is inside a link reference definition and dead. We start a paragraph at
 *        line 2 and the reference is live. Stock micromark agrees with us, so this is a place
 *        Obsidian's fork reads definitions differently.
 *
 *   E5   `a[^^[x]]` is a reference named `^[x`. A footnote name runs to the first `]` and may
 *        hold a `[` or a `^`. We read no reference at all. This is the known-hard family
 *        `README.md` records: it needs a construct claiming `[^` before the wikilink
 *        extension, GFM's footnote call and CommonMark's label start see that bracket, and
 *        three attempts at it are refuted with their numbers.
 */
const DIVERGING_POSITIONS: readonly string[] = [
  // C2: a PIPELESS table's rows do not start with `|`, so an indented line holding one is
  // still a row and the reference in it is live. We read indented code and the reference
  // dies. The PIPED half of C2 is fixed -- see `table-indented-row.ts`.
  "C2 pipeless indented row",
  // D6's TITLE half is FIXED -- `definitionBlankTitleTransform` reads a title that starts
  // after a blank line, so the reference inside it is dead as Obsidian has it, across five
  // cases and both quote styles and parentheses. What it leaves is recorded against
  // `referenceLinks` below.
  //
  // E5, three variants of one rule: a footnote name runs to the first `]` and may hold a `[`
  // or a `^`, giving names `^[x`, `[x` and `x[y`. We read no reference at all. This is the
  // known-hard family `README.md` records -- it needs a construct claiming `[^` before the
  // wikilink extension, GFM's footnote call and CommonMark's label start see that bracket,
  // and three attempts are refuted with their numbers. `E5 whitespace in name` AGREES, which
  // is the half already implemented in `footnote-bare.ts`.
  "E5 bracket in name",
  "E5 bracket name",
  "E5 trailing bracket name",
  // NOT OURS, and MUST NOT REACH ZERO. `1. > [!note] T` / `ab cd[^1]` is reported by the
  // cache at column 8 where the character really sits at 5, which their document states
  // itself under P2: "reports [^1] at column 9 instead of 6". We report 5 and are right, so
  // this entry keeps the set exact rather than recording a debt.
  //
  // It is also the ONLY case in the whole golden that differs on COLUMN alone, which is the
  // audit's answer to "do we handle column": yes, on every case that agrees on line bar this.
  "P2 column quirk",
];

/**
 * Section STARTS, which catch what a footnote comparison cannot.
 *
 * Compared as a set of start lines and deliberately type-agnostic: Obsidian names a section
 * `callout` where our tree has a `blockquote`, and a type comparison would report divergences
 * that are projection naming rather than structure. Start lines are structural, and over all
 * 59 cases they produce exactly these four with no false positives.
 *
 * B10 WAS HERE and is fixed. Its whole difference was structural -- a label between two items
 * is the first item's lazy text, so the list never ended and `- pears` is its next item, one
 * list to Obsidian against our two, with IDENTICAL footnote facts either way. A footnote-only
 * gate called that case clean, which is why this second assertion exists. Seven boundary cases
 * now pin it: the same bullet and the same ordered delimiter merge, a different bullet and a
 * bullet-against-ordered stay apart, a real definition behind blank lines keeps three blocks,
 * and plain lazy text merged even before the fix.
 */
const DIVERGING_SECTIONS: readonly string[] = [
  // The FOUR-space pipeless row only. `C2 pipeless indent 2` is fixed -- `table-row-style.ts`
  // now measures the leading pipe at the table's own content column instead of after
  // `trimStart()`, so an indented row in a pipeless table stays a row. At four spaces
  // micromark makes the line indented CODE before any table logic runs, which is a different
  // defect: the row has to be re-parsed out of a `code` node rather than merely kept.
  "C2 pipeless indented row",
  // The `<...>` DESTINATION half of D6, which `definitionBlankTitleTransform` leaves: a
  // destination running across blank lines has to be REWRITTEN rather than merely spanned,
  // and `referenceLinks` carries its value -- a field 111 corpus answers depend on.
  "D6 angle dest over blank",
];

/**
 * `referenceLinks`, which is the projection D6 is really about.
 *
 * Both entries are the halves `definitionBlankTitleTransform` declines, each recorded with its
 * measured answer rather than guessed:
 *
 *   `[foo]: <a` / blank / `b` / `c>` gives the destination `a\n\nb\nc` where we read `<a`.
 *
 *   `[foo]: /url` / blank / `'unclosed[^1]` reports NO reference link at all -- an unclosed
 *   title DESTROYS the definition rather than merely failing to extend it. That is a demotion,
 *   and getting it wrong deletes a definition the author wrote, which is also why the pass
 *   refuses to half-reproduce it by swallowing the text.
 */
const DIVERGING_REFERENCE_LINKS: readonly string[] = [
  "D6 angle dest over blank",
  "D6 unclosed title destroys definition",
];

const golden = fs.existsSync(GOLDEN)
  ? (JSON.parse(fs.readFileSync(GOLDEN, "utf8")) as {
      obsidian: { app: string };
      cases: readonly Case[];
    })
  : undefined;

describe.skipIf(golden === undefined)("their rules document", () => {
  const file = golden!;

  it("records an answer for every case", () => {
    expect(file.cases.length).toBeGreaterThan(0);
    for (const entry of file.cases) {
      expect(typeof entry.markdown, entry.rule).toBe("string");
      expect(Array.isArray(entry.obsidian.footnotes), entry.rule).toBe(true);
    }
  });

  it("diverges on exactly the recorded examples", () => {
    const found: string[] = [];
    for (const entry of file.cases) {
      const ours = oursFor(entry.markdown);
      const theirs = {
        footnotes: entry.obsidian.footnotes.map(obsKey).sort(),
        footnoteRefs: entry.obsidian.footnoteRefs.map(obsKey).sort(),
      };
      const same =
        JSON.stringify(ours.footnotes) === JSON.stringify(theirs.footnotes) &&
        JSON.stringify(ours.footnoteRefs) ===
          JSON.stringify(theirs.footnoteRefs);
      if (!same) found.push(entry.rule);
    }
    expect(found.sort()).toEqual([...DIVERGING_POSITIONS].sort());
  });

  it("diverges on exactly the recorded section structures", () => {
    const found: string[] = [];
    for (const entry of file.cases) {
      const source = applyTextTransform(entry.markdown);
      const tree = parseOurs(source, "all-features");
      const ours = [
        ...new Set(
          tree.children.map((child) => (child.position?.start.line ?? 1) - 1),
        ),
      ].sort((a, b) => a - b);
      const theirs = [
        ...new Set(entry.obsidian.sections.map((section) => section.start)),
      ].sort((a, b) => a - b);
      if (JSON.stringify(ours) !== JSON.stringify(theirs)) {
        found.push(entry.rule);
      }
    }
    expect(found.sort()).toEqual([...DIVERGING_SECTIONS].sort());
  });

  it("diverges on exactly the recorded reference links", () => {
    const found: string[] = [];
    for (const entry of file.cases) {
      const source = applyTextTransform(entry.markdown);
      const meta = computeOurs(parseOurs(source, "all-features"), source);
      const ours = (meta.referenceLinks ?? [])
        .map((link) => link.split("@")[0]!)
        .sort();
      const theirs = [...(entry.obsidian.referenceLinks ?? [])].sort();
      if (JSON.stringify(ours) !== JSON.stringify(theirs))
        found.push(entry.rule);
    }
    expect(found.sort()).toEqual([...DIVERGING_REFERENCE_LINKS].sort());
  });

  it("reproduces every block-identifier index", () => {
    // D4: a block id counts only at the very END of its block, so `text.[^1] ^water1`
    // registers `water1` and `text. ^water1[^1]` registers none. Held as an ABSOLUTE
    // assertion rather than a ceiling, since both cases already agree.
    const mismatched: string[] = [];
    for (const entry of file.cases) {
      if (entry.obsidian.blocks.length === 0) continue;
      const source = applyTextTransform(entry.markdown);
      // Read from the projection, not from node data: a block identifier is derived by a
      // line scan in `computeOurs` rather than stored on a node, so walking for a
      // `data.blockId` finds nothing and the assertion passes or fails for the wrong reason.
      // Its entries carry a span (`water1@0:0-0:33`) where the golden stores the key alone,
      // so only the identifier is compared.
      const meta = computeOurs(parseOurs(source, "all-features"), source);
      const ids = (meta.blocks ?? [])
        .map((block) => block.split("@")[0]!)
        .sort();
      if (
        JSON.stringify(ids) !==
        JSON.stringify([...entry.obsidian.blocks].sort())
      ) {
        mismatched.push(`${entry.rule}: ours ${JSON.stringify(ids)}`);
      }
    }
    expect(mismatched).toEqual([]);
  });
});
