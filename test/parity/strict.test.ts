/**
 * The strict preset against stock `remark-parse` + `remark-gfm`, over the CommonMark spec.
 *
 * `strict` is what Quartz consumes, and until this file existed it was covered by one assertion
 * that checked the processor was truthy. The 6,818-document corpus measures `legacy` -- it is
 * recorded against Obsidian, which diverges from CommonMark on purpose -- so it says nothing
 * about whether strict is compliant.
 *
 * WHY THIS GATE IS CHEAP AND TERMINATES. Legacy's oracle is a closed-source application behind a
 * live channel, and its answer set is only as complete as the corpus someone thought to generate.
 * Strict's oracle is stock remark: externally authored, locally runnable, and already a
 * dependency. Any input where strict disagrees with stock is either deliberate Obsidian syntax or
 * a bug, with no third possibility and nothing to record.
 *
 * WHAT IS ASSERTED. The divergence set EXACTLY, in both directions. A new divergence fails as a
 * regression; a divergence that disappears fails too, demanding its entry be deleted. A count
 * would permit a silent swap of one leak for another, and `compute.test.ts` already establishes
 * the record-inline convention for a backlog of this shape.
 *
 * `data.lineOffsets` is stripped through `normalizeTree`. Without that, every document differs --
 * it is a legacy side channel attached to every root, empty under strict, and comparing without
 * removing it measures whether the plugin ran rather than how it parsed.
 */
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import remarkObsidian from "../../src/index.js";
import { assertPlausible, normalizeTree } from "./classify.js";
import { COMMONMARK_SPEC } from "./commonmark.js";
import { GFM_SPEC_EXTENSIONS } from "./gfm.js";

/**
 * Obsidian syntax is ON in strict by design, so these are correct rather than tolerated.
 *
 * The README's split is explicit: strict is what Obsidian INTENDS -- the CommonMark, GFM and LaTeX
 * it says it supports, plus the syntax it documents adding (wikilinks, embeds, callouts, tags,
 * `%%`, `==`, `$`, frontmatter, task boxes holding any character) -- and drops what it merely
 * delivers. A spec example that happens to contain `#hashtag` or `[[` therefore SHOULD parse
 * differently.
 */
const BY_DESIGN: readonly string[] = [
  "commonmark/atx-headings/64", // +1tag -1text          `#hashtag`
  "commonmark/setext-headings/96", // +1yaml -1thematicBreak -1heading -1text
  "commonmark/setext-headings/98", // +1yaml -2thematicBreak
  "commonmark/links/548", // +2wikilink
  "commonmark/links/559", // +1wikilink -4text -1linkReference -1emphasis
  "commonmark/images/590", // +2wikilink -1text
  // `data.taskChar` on every box, nothing else: Obsidian documents ANY character between a task's
  // brackets as a checkbox, so strict reads boxes that way and records which character it was.
  // `checked` and the structure are GFM's own.
  "gfm/disabled/279", // +data.taskChar
  "gfm/disabled/280", // +data.taskChar
];

/**
 * Node types agree; positions or values do not. EMPTY, and kept so it can refill.
 *
 * Strict has no position contract of its own -- that constraint belongs to legacy, whose plugin
 * consumers index by offset -- so these never blocked Quartz the way a wrong node type does.
 * They were listed rather than ignored because a position drift is often the first visible
 * symptom of a tokenizer divergence that later changes a type, and all six closed as a
 * side-effect of gating the passes that owned them: `tabs/6` and `tabs/7` under `legacyTabs`,
 * `block-quotes/237`, `block-quotes/249` and `list-items/280` under `legacyContainerLazy`, and
 * `links/507` under `legacyLinkDestinations`.
 *
 * The array stays because the regression test reads it. A new position-only divergence lands
 * here, and the first test in this file will name it.
 */
const POSITION_ONLY: readonly string[] = [];

/**
 * Structural divergences with no Obsidian node type involved. EMPTY, and kept so it can refill.
 *
 * Each entry here produces a different tree shape than stock remark for input containing no
 * Obsidian syntax, which means Quartz would render it wrongly. The list opened at 19, each entry a
 * pass imitating Obsidian's parser with no option for `strict` to clear. Most closed when options
 * gated them, and those passes went with the micromark `legacy` path in 2.0.
 *
 * The last, `raw-html/626`, closed when `strict` stopped running passes for what Obsidian merely
 * delivers. Two of them read `<!-->` the way CommonMark did before 0.31 -- `shortComment` made it
 * text and `commentRegion` paired it with a later `-->` -- where stock reads one complete comment.
 * It had been refused because the conversion that closed it made `remark-stringify` grow a
 * backslash on every format; without the passes `strict` emits stock's `html` node, which writes
 * back byte-identical from the first pass.
 */
const LEAK: readonly string[] = [];

/**
 * GFM extension divergences. EMPTY, and the corpus exists because it could not be empty before.
 *
 * Tables, task list items, strikethrough, extended autolinks and disallowed raw HTML are GFM
 * EXTENSIONS, so no CommonMark example contains one -- the 652-example differential was
 * structurally blind to the passes implementing them, and "owns no spec example" meant "the spec
 * has no coverage", not "this agrees". Obsidian's own docs cite this spec for GFM support.
 *
 * Adding the 24 tagged examples found three divergences on arrival, all tables and all
 * structural, now closed by `legacyTables`. Autolinks, strikethrough and task lists agreed on
 * arrival across all 16 of their examples.
 */
const GFM_EXTENSION: readonly string[] = [];

const RECORDED = new Set([
  ...BY_DESIGN,
  ...POSITION_ONLY,
  ...LEAK,
  ...GFM_EXTENSION,
]);

const CORPUS: ReadonlyArray<readonly [string, string]> = [
  ...COMMONMARK_SPEC,
  ...GFM_SPEC_EXTENSIONS,
];

const stock = unified().use(remarkParse).use(remarkGfm);
const strict = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkObsidian, { preset: "strict" });

function tree(processor: typeof stock, source: string): string {
  return JSON.stringify(
    normalizeTree(processor.runSync(processor.parse(source), source)),
  );
}

function diverging(): string[] {
  const out: string[] = [];
  for (const [id, source] of CORPUS) {
    if (tree(stock, source) !== tree(strict, source)) out.push(id);
  }
  return out;
}

describe("strict preset", () => {
  it("has no unrecorded divergence from stock remark-parse + remark-gfm", () => {
    const observed = diverging();
    assertPlausible(observed.length, CORPUS.length, "strict vs stock");

    const unrecorded = observed.filter((id) => !RECORDED.has(id));
    expect(
      unrecorded,
      "strict diverges from CommonMark on NEW input -- a regression",
    ).toEqual([]);
  });

  it("has no stale entry in the recorded divergence set", () => {
    const observed = new Set(diverging());
    const fixed = [...RECORDED].filter((id) => !observed.has(id)).sort();
    expect(
      fixed,
      "these now AGREE -- delete them from the list in this file",
    ).toEqual([]);
  });

  it("keeps the recorded sets disjoint and the backlog visible", () => {
    expect(RECORDED.size, "an id is listed twice").toBe(
      BY_DESIGN.length +
        POSITION_ONLY.length +
        LEAK.length +
        GFM_EXTENSION.length,
    );
    // A bare count, asserted so that shrinking the backlog is a deliberate edit here rather than
    // something that silently stops being measured.
    expect(LEAK.length).toBe(0);
  });
});
