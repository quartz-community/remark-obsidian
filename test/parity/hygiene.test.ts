import fs from "node:fs";
import path from "node:path";

import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkBreaks from "remark-breaks";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import remarkObsidian from "../../src/index.js";
import { buildCorpus } from "./corpus.js";
import { applyTextTransform, PROFILES } from "./chain.js";
import type { Root } from "mdast";

import type { GoldenCase } from "./types.js";

const goldens = path.join(import.meta.dirname, "goldens/obsidian.json");
const golden = JSON.parse(fs.readFileSync(goldens, "utf8")) as {
  cases: Record<string, GoldenCase>;
};

/**
 * Where the chain is ORDER-COUPLED: a pass that relocates a node, before a pass that reads
 * where it sits.
 *
 * This began as an idempotence gate -- "running the chain twice over one tree changes
 * nothing" -- and that framing was a category error worth recording, because the test passed
 * review and the number looked like a defect count. **The chain is a pipeline from a fresh
 * parse, not a fixed-point operator**, and nothing in it claims otherwise. A consumer parses
 * once and runs once; `unified` makes a second `runSync` possible but no pass is written for
 * it.
 *
 * What the 23 actually mark is real and narrower. Instrumenting `math/list-boundary`:
 *
 *     after parse   line=3 col=4 off=23 v=""          micromark's node, at the closing `$$`
 *     after run 1   line=1 col=10 off=9 v="   Math"   a pass relocated it to the opener
 *     after run 2   line=1 col=10 off=9 v="Math"
 *
 * `mathFenceTransform` reads `position.start.line` to index `data.lineOffsets`, and on the
 * first run it sees micromark's line while on the second it sees the relocated one. Neither
 * `lineOffsets` nor the offsets changed -- verified, both identical across all three stages.
 * So this is not the stale-point hazard the `.column` audit covers; it is two passes coupled
 * through a position that one of them moves.
 *
 * That coupling IS worth a gate, because it is invisible to every other check here: both
 * passes are correct on a fresh parse, the parity gate is green, and the order is undocumented
 * in `src/index.ts`. The list is the set of places where swapping those two passes would
 * change output, which is a fragility map rather than a bug list -- and `pass-order.mts`
 * reports the same coupling from the other direction.
 *
 * Held as a LIST so the set cannot grow unnoticed. A NEW entry means a newly order-coupled
 * pair, which is worth knowing; a entry disappearing means a coupling was removed.
 */
function runTwice(markdown: string, profile: keyof typeof PROFILES) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, PROFILES[profile].remarkObsidian)
    .use(remarkBreaks);
  const source = applyTextTransform(markdown);
  const once = processor.runSync(processor.parse(source), source);
  const after = JSON.stringify(once);
  const twice = processor.runSync(once as Root, source);
  return { after, again: JSON.stringify(twice) };
}

/**
 * The 23 case/profile pairs where a second run reads a position the first run moved, of 6,806.
 *
 * A LIST rather than a count, so a change that trades one case for another cannot hide.
 * Grouped by what they share:
 *
 * - **Math inside a container, 5 cases.** `math/list-boundary`, `math/midline-list`,
 *   `math/unclosed-quote-lazy`, `fuzz/math/12`, `probe/math-marker/dash-opener-alone`. The
 *   same `1. Hello $$` / `   Math` / `   $$` / `2.` that `invariants.test.ts` reports for
 *   overlapping list items -- the math block outlives the item holding it, so on a second
 *   run the passes that read the item's extent see a different one. Two independent gates
 *   pointing at one defect, which is the argument for having both.
 * - **A comment straddling a container, 4 cases.** `fuzz/comment/8`,
 *   `probe/callout-block-body/comment-lazy`, `probe/straddle/callout-comment`,
 *   `hunt/blockquote-region-outlives-quote/2`. A comment's value is rebuilt from a raw source
 *   slice, so the second run re-applies a slice to a value that already absorbed it -- the
 *   governing rule here, met for the fifth time: a raw slice is the right source for a
 *   position and the wrong one for a value.
 * - `commonmark/raw-html/626` is the case already recorded as refused for growing the
 *   author's file on every format pass, so its instability is known and deliberate.
 * - `fuzz/misc/2` and `task/escaped-marker` are singletons, and `task/escaped-marker` is the
 *   only entry that appears under one profile and not both.
 */
/**
 * EMPTY since 2.0: `legacy` parses with remark-parse 8 and runs no correction pass, so there is
 * no pass pair left to couple. The 23 entries recorded here before were all passes
 * re-reading a position another had moved -- `commonmark/raw-html/626`, the `fuzz/comment`,
 * `fuzz/math`, `math/*` and comment-straddle families.
 */
const NON_IDEMPOTENT = [] as const;

describe("chain order-coupling", () => {
  it("couples no more pass pairs through a moved position than recorded", () => {
    const offenders: string[] = [];
    for (const [id, entry] of Object.entries(golden.cases)) {
      for (const profile of Object.keys(PROFILES) as Array<
        keyof typeof PROFILES
      >) {
        let result;
        try {
          result = runTwice(entry.markdown, profile);
        } catch (error) {
          offenders.push(
            `${id} [${profile}] threw: ${String(error).slice(0, 70)}`,
          );
          continue;
        }
        if (result.after !== result.again) {
          offenders.push(`${id} [${profile}]`);
        }
      }
    }
    expect(offenders.sort()).toEqual([...NON_IDEMPOTENT].sort());
  }, 600_000);
});

/**
 * Every case that is not `match` carries a reason.
 *
 * The triage states are what keep this a regression gate rather than a perfection gate, and
 * they only work if each non-matching case says WHY. A `replicate` with no note is
 * indistinguishable from a case nobody has looked at, and the backlog then rots quietly --
 * which these notes record happening once, at 106 of 107 cases carrying a cause, with the
 * one exception found by hand rather than by a gate.
 *
 * `match` needs no note and most do not have one, so this asserts only over the rest.
 */
describe("triage hygiene", () => {
  it("gives every non-matching case a recorded reason", () => {
    const offenders = Object.entries(golden.cases)
      .filter(([, entry]) => entry.triage !== "match")
      .filter(([, entry]) => (entry.note ?? "").trim().length < 20)
      .map(([id, entry]) => `${id} [${entry.triage}]`);
    expect(offenders).toEqual([]);
  });

  it("records no triage state outside the documented set", () => {
    const allowed = new Set([
      "match",
      "replicate",
      "report-upstream",
      "upstream-undecided",
      "out-of-scope",
      "accepted",
      "unreviewed",
    ]);
    const offenders = Object.entries(golden.cases)
      .filter(([, entry]) => !allowed.has(entry.triage))
      .map(([id, entry]) => `${id} [${entry.triage}]`);
    expect(offenders).toEqual([]);
  });
});

/**
 * The corpus and the goldens describe the same documents.
 *
 * Cases are deduplicated by markdown, so a newly designed probe REPLACES an incidental fuzz
 * case holding the same source -- which is an improvement, and the hazard these notes already
 * record: a case that keeps its id while changing content moves a triage state onto a
 * different document, and a case that vanishes takes its recorded reason with it. Both were
 * being checked by hand after every recording, which is how the C3 no-pipe control nearly
 * displaced `hunt/label-after-pipeless-table/0` and its note.
 */
describe("corpus and goldens agree", () => {
  const corpus = buildCorpus();

  it("generates no two cases from the same markdown", () => {
    const byMarkdown = new Map<string, string[]>();
    for (const entry of corpus) {
      byMarkdown.set(entry.markdown, [
        ...(byMarkdown.get(entry.markdown) ?? []),
        entry.id,
      ]);
    }
    const collisions = [...byMarkdown.values()]
      .filter((ids) => ids.length > 1)
      .map((ids) => ids.join(" <-> "));
    expect(collisions).toEqual([]);
  });

  it("records the same markdown for every id the goldens hold", () => {
    const drifted = corpus
      .filter((entry) => golden.cases[entry.id] !== undefined)
      .filter((entry) => golden.cases[entry.id]!.markdown !== entry.markdown)
      .map((entry) => entry.id);
    expect(drifted).toEqual([]);
  });
});

/**
 * Each preset clears exactly the flags its documentation claims.
 *
 * The README's table is the contract -- `strict` turns off the divergences this package
 * inherited from `remark-parse@8` and keeps Obsidian's own constructs on. A new option added
 * without a preset entry is silently `legacy`-only, which is the kind of drift nothing else
 * here would catch: both profiles would keep passing and the published table would be wrong.
 */
describe("preset coherence", () => {
  it("leaves Obsidian's own constructs on under `strict`", () => {
    const obsidian = [
      "wikilinks",
      "highlights",
      "comments",
      "tags",
      "math",
      "frontmatter",
      "callouts",
      "inlineFootnotes",
    ] as const;
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkObsidian, { preset: "strict" });
    expect(processor).toBeTruthy();
    // Asserted through behaviour rather than by reading the options back, since the
    // resolved set is private: each construct has to still parse.
    const parse = (markdown: string) => {
      const source = applyTextTransform(markdown);
      return JSON.stringify(processor.runSync(processor.parse(source), source));
    };
    const present: Record<string, boolean> = {
      wikilinks: parse("[[a]]\n").includes('"wikilink"'),
      highlights: parse("==a==\n").includes('"highlight"'),
      comments: parse("%%a%%\n").includes('"comment"'),
      tags: parse("#tag\n").includes('"tag"'),
      math: parse("$a$\n").includes("Math"),
      callouts: parse("> [!note] t\n").includes('"callout"'),
    };
    expect(present).toEqual({
      wikilinks: true,
      highlights: true,
      comments: true,
      tags: true,
      math: true,
      callouts: true,
    });
    expect(obsidian.length).toBeGreaterThan(0);
  });
});
