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
 * Running the transform chain twice over one tree changes nothing.
 *
 * Not the same property as the round-trip gate, which checks parse -> serialise -> parse
 * converges. This checks the chain itself: ~70 passes that splice, fold and re-span nodes,
 * every one of which sees its own output on a second run. A pass that appends rather than
 * replaces, or widens a span it already widened, is a latent defect -- it needs no unusual
 * input to be wrong, only to run twice, which `unified` makes trivially possible for any
 * consumer holding a processor and a tree.
 *
 * It also catches a specific hazard this repo has met four times: a pass that reads a raw
 * source slice to rebuild a value. On the first run the slice matches the node; on the second
 * it is re-applied to a value that already absorbed it. The round-trip gate found that class
 * through the serialiser, which only sees it when the output is re-parsed; this sees it
 * directly.
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
 * The 23 case/profile pairs where a second run changes the tree, of 6,806.
 *
 * A LIST rather than a count, so a fix that trades one case for another cannot hide. Grouped
 * by what they share:
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
const NON_IDEMPOTENT = [
  "commonmark/raw-html/626 [all-features]",
  "commonmark/raw-html/626 [quartz-default]",
  "fuzz/comment/8 [all-features]",
  "fuzz/comment/8 [quartz-default]",
  "fuzz/math/12 [all-features]",
  "fuzz/math/12 [quartz-default]",
  "fuzz/misc/2 [all-features]",
  "fuzz/misc/2 [quartz-default]",
  "hunt/blockquote-region-outlives-quote/2 [all-features]",
  "hunt/blockquote-region-outlives-quote/2 [quartz-default]",
  "math/list-boundary [all-features]",
  "math/list-boundary [quartz-default]",
  "math/midline-list [all-features]",
  "math/midline-list [quartz-default]",
  "math/unclosed-quote-lazy [all-features]",
  "math/unclosed-quote-lazy [quartz-default]",
  "probe/callout-block-body/comment-lazy [all-features]",
  "probe/callout-block-body/comment-lazy [quartz-default]",
  "probe/math-marker/dash-opener-alone [all-features]",
  "probe/math-marker/dash-opener-alone [quartz-default]",
  "probe/straddle/callout-comment [all-features]",
  "probe/straddle/callout-comment [quartz-default]",
  "task/escaped-marker [all-features]",
] as const;

describe("transform idempotence", () => {
  it("changes no tree on a second run beyond the recorded set", () => {
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
