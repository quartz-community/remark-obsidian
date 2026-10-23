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

/**
 * Obsidian syntax is ON in strict by design, so these are correct rather than tolerated.
 *
 * The README's split is explicit: strict keeps Obsidian's SYNTAX (wikilinks, embeds, callouts,
 * tags, `%%`, `==`, `$`, frontmatter) and drops only the divergences Obsidian inherited from
 * `remark-parse@8`. A CommonMark example that happens to contain `#hashtag` or `[[` therefore
 * SHOULD parse differently.
 */
const BY_DESIGN: readonly string[] = [
  "commonmark/atx-headings/64", // +1tag -1text          `#hashtag`
  "commonmark/setext-headings/96", // +1yaml -1thematicBreak -1heading -1text
  "commonmark/setext-headings/98", // +1yaml -2thematicBreak
  "commonmark/links/548", // +2wikilink
  "commonmark/links/559", // +1wikilink -4text -1linkReference -1emphasis
  "commonmark/images/590", // +2wikilink -1text
  "commonmark/raw-html/619", // +1text +1tag
];

/**
 * Node types agree; positions or values do not. Lower severity, still unexplained.
 *
 * Strict has no position contract of its own -- that constraint belongs to legacy, whose plugin
 * consumers index by offset -- so these do not block Quartz the way a wrong node type does. They
 * are listed rather than ignored because a position drift is often the first visible symptom of a
 * tokenizer divergence that later changes a type.
 */
const POSITION_ONLY: readonly string[] = [
  "commonmark/tabs/6",
  "commonmark/tabs/7",
  "commonmark/block-quotes/237",
  "commonmark/block-quotes/249",
  "commonmark/list-items/280",
  "commonmark/links/507",
];

/**
 * Structural divergences with no Obsidian node type involved. THIS IS THE BACKLOG.
 *
 * Each produces a different tree shape than stock remark for input containing no Obsidian syntax,
 * which means Quartz renders these wrongly today. Two families dominate and both are legacy
 * behaviour reaching into strict:
 *
 *   setext-headings x6   we emit `paragraph` where CommonMark emits `heading`
 *   link-ref-defs   x5   we emit `paragraph` where CommonMark emits `definition`
 *
 * `link labels` is named in the README as a divergence strict CLEARS, so those five are
 * unambiguous leaks.
 *
 * SETEXT IS OUR OWN DEFECT, and that is checked rather than assumed. There is no setext option
 * at all, and SIX of the seven setext passes in `src/index.ts` are UNCONDITIONAL --
 * `definitionSetextTransform` (837), `lazySetextTransform` (869), `containerSetextTransform`
 * (870), `setextUnderlineTransform` (873), `htmlSetextTransform` (878) and
 * `multilineSetextTransform` (882). Only `setextDefinitionTransform` (898) carries a guard, and
 * that guard is `opts.bareFootnoteRefs`. So `preset: "strict"` cannot turn any of this off, and
 * the six divergences are legacy setext behaviour running unconditionally in strict -- a missing
 * option rather than a wrong rule.
 *
 * `raw-html/626` is already recorded as a refused case in `hygiene.test.ts`; it is here for
 * completeness, not as new work.
 */
const LEAK: readonly string[] = [
  "commonmark/tabs/2", // +1paragraph +1text -1code
  "commonmark/tabs/11", // +3list +3listItem -1thematicBreak
  "commonmark/setext-headings/81", // +1paragraph +2text -1heading
  "commonmark/setext-headings/82", // +1paragraph +2text -1heading
  "commonmark/setext-headings/84", // +2text +1paragraph -1heading
  "commonmark/setext-headings/86", // +1paragraph +1thematicBreak -1heading
  "commonmark/setext-headings/93", // +1text +1heading
  "commonmark/setext-headings/95", // +1paragraph +1thematicBreak -1heading
  "commonmark/link-reference-definitions/196", // +1paragraph +9text -1definition
  "commonmark/link-reference-definitions/200", // +1paragraph +1text -1definition
  "commonmark/link-reference-definitions/202", // +1paragraph +1text -1definition
  "commonmark/link-reference-definitions/210", // +4text -1definition
  "commonmark/link-reference-definitions/216", // +1heading -1definition
  "commonmark/block-quotes/238", // +1code
  "commonmark/list-items/257", // +1paragraph +1text -1code
  "commonmark/links/493", // +1link
  "commonmark/links/546", // +1definition -1paragraph -1text
  "commonmark/links/552", // +1linkReference +1break +1definition -1paragraph -1text
  "commonmark/raw-html/626", // -1html   already refused, see hygiene.test.ts
];

const RECORDED = new Set([...BY_DESIGN, ...POSITION_ONLY, ...LEAK]);

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
  for (const [id, source] of COMMONMARK_SPEC) {
    if (tree(stock, source) !== tree(strict, source)) out.push(id);
  }
  return out;
}

describe("strict preset", () => {
  it("has no unrecorded divergence from stock remark-parse + remark-gfm", () => {
    const observed = diverging();
    assertPlausible(observed.length, COMMONMARK_SPEC.length, "strict vs stock");

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
      BY_DESIGN.length + POSITION_ONLY.length + LEAK.length,
    );
    // A bare count, asserted so that shrinking the backlog is a deliberate edit here rather than
    // something that silently stops being measured.
    expect(LEAK.length).toBe(19);
  });
});
