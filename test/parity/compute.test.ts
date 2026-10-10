import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { applyTextTransform, parseOurs } from "./chain.js";
import { computeOurs } from "./normalize.js";
import type { ComputedMeta, GoldenCase } from "./types.js";

/** Both compared profiles, as the main gate compares them. */
const PROFILES = ["quartz-default", "all-features"] as const;

const goldenPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "goldens",
  "obsidian.json",
);

const KEYS = [
  "footnotes",
  "footnoteRefs",
  "headings",
  "sections",
  "links",
  "embeds",
  "tags",
  "blocks",
  "listItems",
  "frontmatterPosition",
] as const;

/**
 * Drop the zero-length `text`/`element` sections Obsidian appends for its
 * rendered footnote list. They cover no source, so no projection derived from
 * the source can hold them, and `compare.ts` drops the same pair from the
 * other sections projection for the same reason.
 */
const ZERO_LENGTH = /^(?:text|element)@(\d+):(\d+)-(\d+):(\d+)$/;

function sourceBacked(sections: readonly string[]): readonly string[] {
  return sections.filter((entry) => {
    const match = ZERO_LENGTH.exec(entry);
    return !(match && match[1] === match[3] && match[2] === match[4]);
  });
}

/**
 * Which keys diverge, taking the better of the two profiles.
 *
 * A case passes if **either** profile reproduces Obsidian, exactly as the main
 * gate does: that is what separates "this package cannot do it" from "Quartz's
 * default configuration disables it".
 */
function divergedKeys(golden: GoldenCase): readonly string[] {
  const want = golden.obsidian.compute;
  if (!want) return [];
  let fewest: readonly string[] | undefined;
  for (const profile of PROFILES) {
    // The transformed source, as `compare.ts` already passes to `metaOurs`. The tree is
    // parsed from it, so handing the raw markdown here puts every node offset one
    // character out for a document with a byte-order mark -- which named
    // `probe/line-ending/bom-heading` `#` instead of `H`.
    const ours = computeOurs(
      parseOurs(golden.markdown, profile),
      applyTextTransform(golden.markdown),
    );
    const diverged = KEYS.filter((key) => {
      const theirs = want[key as keyof ComputedMeta];
      const expected =
        key === "sections" && Array.isArray(theirs)
          ? sourceBacked(theirs as readonly string[])
          : theirs;
      // Nothing on both sides is agreement. `frontmatterPosition` is a single
      // value rather than a list and most documents have no frontmatter, so
      // treating absent as different from empty called 2597 of them diverged.
      const nothing = (value: unknown) =>
        value === undefined || (Array.isArray(value) && value.length === 0);
      if (nothing(expected) && nothing(ours[key])) return false;
      return JSON.stringify(ours[key]) !== JSON.stringify(expected);
    });
    if (diverged.length === 0) return [];
    if (!fewest || diverged.length < fewest.length) fewest = diverged;
  }
  return fewest ?? [];
}

/**
 * The positioned oracle: Obsidian's own parser, on a string, with line and
 * column for every footnote and heading.
 *
 * Gated separately from `parity.test.ts` on purpose. A case carries one triage
 * state, so folding a sharper oracle into the main gate would force dozens of
 * cases that genuinely reproduce Obsidian's text and `metadataCache` to be
 * downgraded, losing the distinction between "wrong content" and "right content
 * in the wrong place". The retired `math-content.test.ts` separated a sharper
 * oracle for the same reason, until 1.14 became `latest` and the main golden
 * could carry `mathTex` itself -- which is the shape this one should reach too,
 * once its ceilings are worked down.
 *
 * This is a backlog gate, not a perfection gate: the ceilings below may fall
 * and may not rise.
 */
describe("positioned oracle", () => {
  const file = JSON.parse(fs.readFileSync(goldenPath, "utf8")) as {
    cases: Record<string, GoldenCase>;
  };
  const cases = Object.values(file.cases);
  const answered = cases.filter((entry) => entry.obsidian.compute);
  const diverged = new Map<string, readonly string[]>();
  for (const entry of answered) {
    const keys = divergedKeys(entry);
    if (keys.length > 0) diverged.set(entry.id, keys);
  }

  it("has an answer recorded for every case", () => {
    expect(answered.length).toBe(cases.length);
    expect(cases.length).toBeGreaterThan(2000);
  });

  /**
   * Enumerated rather than counted, because this group is small enough to have
   * been classified case by case — and two of them are Obsidian's own defect
   * rather than ours, so a fix here would be a regression.
   *
   * `P1` is the author of Obsidian Footnotes Shortcuts' name for it, reported
   * with his rule set: a reference on a `%%` opener line is placed as if the
   * marker were not there, so Obsidian reports a column two short of where the
   * reference is written. Our column is the correct one and stays.
   *
   * Nothing else remains. The three that were real gaps all closed by placing
   * what a pass splices: a reference in a link reference definition's
   * destination (`[foo]: [^9]`) once `legacyDefinitionTransform` placed the line
   * it keeps verbatim, and one inside an indented `%%` run once
   * `commentInDefinitionTransform` placed its prose. What is left is only
   * Obsidian's own defect, which a fix here would be a regression against.
   */
  /**
   * Both remaining entries are `P1`, where a fix would be a regression: Obsidian's
   * cache reports a column short by the width of a `%%` marker.
   *
   * The third entry is gone. It was the `[` that opens a link label straight after a
   * link text's `]`, recorded here as needing tokenizer precedence between the
   * wikilink extension and CommonMark's link label, and explicitly "not a repair
   * pass". That was wrong, and a probe wave is what showed it: separating the shapes
   * where the `[[` *does* open a wikilink -- after a footnote reference, after
   * another wikilink, after an inline footnote -- left a condition a repair pass can
   * test, namely that the preceding sibling is a plain text node ending in `]`.
   * `labelOpenerWikilinkTransform` closed it and three sibling probes with it.
   */
  const KNOWN_REFERENCE_GAPS = [
    "hunt/aftercloser-chain-eats-referenced-definition/0: P1, Obsidian's column is short by the `%%` marker",
    "hunt/continuation-masked-under-foreign-label/2: P1, Obsidian's column is short by the `%%` marker",
  ];

  it("places every footnote reference, except the classified cases", () => {
    const offenders = [...diverged]
      .filter(([, keys]) => keys.includes("footnoteRefs"))
      .map(([id]) => id)
      .sort();
    expect(offenders).toEqual(
      KNOWN_REFERENCE_GAPS.map((entry) => entry.split(":")[0]).sort(),
    );
  });

  /**
   * `footnotes` is dominated by the doubled inline opener: Obsidian consumes
   * characters in `^[^[note]` and reports no footnote at all, showing the body as
   * literal text. The whole family is `report-upstream` -- 18 cases, found by
   * testing the signature rather than by listing ids: Obsidian's text is ours with
   * the footnote placeholder replaced by the footnote's own body.
   *
   * They are not `replicate`, because no permissible fix reaches `match`.
   * Suppressing our spurious `footnote` node would leave Obsidian's character drop
   * behind, and reproducing that drop in the tree would let a formatter delete the
   * author's `^[` and `]` -- the rule that also keeps a surplus table cell and a
   * colour marker. Balance decides whether Obsidian forms one at all: `^[^[note]]`
   * and `^[^[^[x]]]` close evenly and do match.
   *
   * `headings` is dominated by a raw HTML line over a setext underline —
   * `<br>` / `===` is a heading named `<br>` to Obsidian, while the html block
   * wins for us.
   */
  /**
   * `sections` is Obsidian's own block-level parse with offsets, and the
   * widest dimension here: 102 of its divergences agree on the block types and
   * differ only on where the blocks end, 50 split the document into a
   * different number of blocks, and 14 disagree about a type.
   *
   * It earns its place immediately. `probe/line-ending/lone-cr` is triaged
   * `match` because every other oracle agrees on its text, yet `a\rb\r` is
   * `paragraph@0:0-1:1` to Obsidian and `0:0-0:3` to us -- a lone carriage
   * return is a line ending for its numbering and not for ours. No projection
   * compared before this one could see that.
   */
  /**
   * The five dimensions below were recorded first and projected second, and
   * each one's remainder has a named cause.
   *
   * `links` and `embeds`: mostly wikilinks in contexts we do not parse at all
   * (`[[[link](u)]]`, `[[]]]`, one inside `[^...]`), plus `[[page#]]`, where
   * Obsidian keeps the trailing `#` in the resolved target and we drop it. One
   * embed case diverges on ordering alone -- Obsidian listed a link at column
   * 38 before one at column 15 -- so its array is not reliably document order.
   * Compared in order regardless: sorting both sides recovered exactly one
   * case, which does not pay for losing the ordering assertion.
   *
   * `tags`: a tag we miss entirely inside a callout or after a tab, and one
   * whose column is short by a nested quote's prefix.
   *
   * `footnotes` and `sections` each carry the ten `probe/definition-column`
   * cases, which match on every other projection and differ only on the column a
   * definition reports. That column is where the containing block's content
   * begins -- `   [^1]:` is 0 whatever the indent, `>  [^1]:` is 2, `-  [^1]:` is
   * 3, `- [ ]  [^1]:` is 6 -- and it is deliberately not reproduced: the node has
   * to keep pointing at the `[` so a consumer can edit by offset. A projection
   * modelled on container prefix plus checkbox fits all ten probes and still
   * fails real documents, where `    [^Note]:` reports 4 rather than 0, so the
   * convention is only partly understood and guessing it would be worse.
   *
   * `blocks` fell from 15 once twelve probes settled its rule: the caret must
   * follow whitespace, which is why `^blk` alone registers nothing and ` ^blk`
   * registers, and why `$x^2`, `[^1` and `[[a#^blk` are not identifiers at all.
   * What remains is a handful of fuzz-derived oddities where Obsidian finds an
   * identifier inside a bracket construct -- `[^1](u)` reports the block `1` --
   * which no rule here explains yet.
   *
   * `listItems` fell from 108 once seven probes settled `parent` and the span.
   * It fell again, from 76, when that defect was fixed: `taskReparseTransform`
   * placed a re-parsed body at the fragment's offsets rather than the
   * document's, so `- [ ] 1.` nested a list claiming offset 0 instead of 6.
   * This was the first oracle able to see it, and the same fix emptied the
   * lossiness gate's exception list.
   *
   * `frontmatterPosition`: Obsidian reports none for frontmatter that is empty
   * or holds an unterminated string, which is a judgement about whether the
   * YAML parses. We deliberately do not parse YAML -- Quartz owns that -- so
   * these are out of reach here rather than unimplemented.
   */
  /**
   * A probe wave drawn from sweep 700000 moved six of these, all of it new debt
   * rather than regression -- every one is a case the wave was written to expose.
   * Attributed exactly, by dumping which new id joins which key:
   *
   *     links        +3  tag-in-label/{heading-full-link,quote-full-link,
   *                      nested-in-destination}
   *
   * All three `links` cases *match* on the main gate: a `#tag` inside a link label now
   * tags correctly, while this oracle still disagrees about the link around it. Same
   * split as `block-id-wrapper` below -- projection and compute are separate passes and
   * `compareCase` reads only the first.
   *
   * A third, smaller wave probed the boundaries those fixes left unmeasured, and three
   * of its six answers landed here rather than on the main gate:
   *
   *     embeds       +1  tag-in-label/image-opener
   *     blocks       -1  the wrapper tail now admits a following word, which also
   *                      closed block-id-inline/wrapped-then-block
   *     sections     -1  a leading byte-order mark no longer shifts every slice
   *
   * `![#tag](u)` matches on the main gate too: the tag is right, and this oracle
   * disagrees about the image around it.
   *
   * `sections` went 139 to 44 and the five cases both waves added to it went with the
   * other 90. Obsidian reports a top-level block's section from the start of its
   * *line*, so a block indented one to three spaces begins at column 0 where mdast
   * begins it at the content -- which was 87 of the cases measured as disagreeing on
   * nothing else, and the single largest family this oracle held.
   *
   * It had been declined twice as the "definition start-column convention", on the
   * strength of `    [^12]:` reporting column 2 rather than 0, which made the rule look
   * inconstant. Four spaces is indented *code*: a different construct, never a
   * top-level paragraph, and so never this family at all. Keying on "the prefix is only
   * whitespace" rather than on an indent width separates them, and the apparent
   * counter-example was the reason the real rule stayed hidden.
   *
   * Three of the first wave's cases have since come off these lists entirely.
   * `entity-bare/lone-ampersand-in-item` held `sections` and `listItems` until the
   * unclosed-frontmatter mis-parse was repaired; `footnote-bare/colon-then-blank-run`
   * held `sections` and `footnotes` until a definition learned to take a trailing
   * whitespace-only line; and `callout-title-caret/empty-inline-footnote` held
   * `footnoteRefs` until a callout title learned to see a node that collects to no
   * text at all.
   *
   * `blocks` is absent from that list because it went back down: it rose to 21 with
   * the three `block-id-wrapper` cases and returned to 18 when they were fixed, which
   * was one rule rather than three -- a block identifier inside an inline wrapper is
   * recognised when the wrapper ends the line, and all three merely put a `.` after
   * it.
   *
   * That fix is also why this list is worth dumping rather than inferring. The main
   * gate went green on all three while this oracle still reported `[]` for every one
   * of them, because the projection and the block scan are separate passes; and the
   * first attempt at the scan quietly broke `block-id-inline/underscore-wraps`, which
   * no `compareCase` delta can see.
   */
  const CEILING = {
    // 17 -> 6 with `definitionColumnTransform`: a definition's start column is its
    // containing block's content column, not the position of the `[`. The 11 closed were
    // every space-indented definition in the corpus. A tab in the prefix is excluded and
    // keeps its own rule -- see the pass.
    // All 6 are SPAN, the name-level rule being fully closed, and they split 3 START /
    // 3 END with NO single convention. Measured, including the blast radius a clamp
    // would have -- which is the number three `sections` attempts failed to take:
    //
    //     matching footnote entries whose obs end is column 0:  0
    //
    // So an end clamp here is free of risk by construction, unlike on `sections`. The
    // six still do not support one:
    //
    //   START, and in BOTH directions, so at least two rules:
    //     '>  [^1]: def'                 obs 1@0:2    ours 1@0:3   (we are one too far)
    //     'hunt/label-after-comment...'  obs 1@4:4    ours 1@4:5
    //     '1. item' / '' / '    [^1]:'   obs 1@2:4    ours 1@2:3   (we are one short)
    //
    //   END, and these are EXTENT rather than a clamp:
    //     'hunt/definition-block-owns...' obs 9@2:0-3:8   ours 9@2:0-4:0
    //     'hunt/quoted-definition-own...' obs 2@0:2-0:12  ours 2@0:2-1:2
    //     'hunt/quoted-orphan-deletion...' obs 9@2:2-2:13 ours 9@2:2-3:2
    //
    // The middle one is the tell: inside a blockquote our end sits after `> ` on the
    // NEXT line, so backing up over whitespace stops at the `>` and never reaches
    // 0:12. These are the recorded definition end-line family -- Obsidian ends a
    // definition at an unclosed opener inside it while we let the construct run on --
    // and that is a parse-extent question, not a projection clamp.
    footnotes: 6,
    footnoteRefs: 2,
    // Attributed: all 12 are `both`, and 10 of them are ONE rule -- the same one
    // `definitionColumnTransform` already implements for footnote definitions.
    // Obsidian reports a heading's column as its containing block's content column,
    // not the position of the marker:
    //
    //     ' ### foo'       obs 3:foo@0:0   ours 3:foo@0:1
    //     '  ## foo'       obs 2:foo@1:0   ours 2:foo@1:2
    //     '   # foo'       obs 1:foo@2:0   ours 1:foo@2:3
    //     '   Foo' / '---' obs 2:Foo@0:0   ours 2:Foo@0:3   (setext too)
    //
    // 12 -> 6. Fixed in the PROJECTION, not the tree, which is what the refuted first
    // attempt got wrong: generalising `definitionColumnTransform` to heading nodes moved
    // this only 12 -> 11 and broke five matching cases, because `sections` already
    // clamps an indented top-level block to column 0 through `sectionStart` and moving
    // the node double-adjusted a span that was right. The headings push was simply using
    // `atPoint` where `sections` uses `sectionStart`; both now share the clamp that was
    // already measured across 87 cases.
    // Two are NOT that rule and want separate treatment: `probe/line-ending/bom-heading`
    // differs on the NAME (obs `1:H`, ours `1:#`), and
    // `commonmark/link-reference-definitions/*` differs on the LINE (obs 1, ours 0).
    // 6 -> 1. The five were a setext heading whose content starts on a LATER line than
    // the node: `[ref]: /url` / `para` / `===` reports `1:para@1:0` to Obsidian and
    // reported `0:0` here. UPSTREAM -- bare `remark-parse` + `remark-gfm` gives
    // `definition@0:0-0:11` beside `heading@0:0-2:3`, so the two overlap and none of
    // our passes touch it. Corrected in the projection by taking the first child's
    // line, which is a perfect discriminator: of the 225 heading nodes in agreeing
    // cases none has a child on a different line, and all five divergences do.
    //
    // `definitionSetextTransform` was the obvious suspect and is innocent: it requires
    // the underline DIRECTLY under the definition and declines when `para` intervenes,
    // which is also why the heading is named `para` rather than `[ref]: /url`.
    //
    // The sixth was a NAME bug and is also fixed: `probe/line-ending/bom-heading` was
    // `1:#` here against Obsidian's `1:H`, because THIS FILE passed the raw markdown as
    // the source while the tree is parsed from the transformed one. A byte-order mark is
    // stripped by `applyTextTransform`, so every node offset was one character out.
    // `compare.ts` already passed the transformed source to `metaOurs`; this call site
    // did not. The key is now 0.
    headings: 0,
    // 33 -> 27. The 4 we-INVENT rows were the standalone block-identifier paragraphs --
    // we emitted a `paragraph` section Obsidian consumes -- and the cluster A fix closed
    // them along with two more, exactly as the recorded coupling predicted. The 27
    // remaining are all SPAN.
    // The 26 are all SPAN, and 11 of 14 sampled want the end at the LAST CONTENT
    // CHARACTER rather than past the line ending -- `- $$y` is `list@0:0-0:5` against
    // our `1:0`, `$$` over `Math$$` is `math@0:0-1:6` against our `2:0`, and
    // `[foo]: /url` over `"title" ok` is `paragraph@0:0-1:10` against our `2:0`.
    //
    // ATTEMPTED AND REFUTED: clamping every section end back over its line ending
    // takes this 26 -> 70, a 44-case over-fire, because the matching majority ends at
    // next-line-column-0 and Obsidian agrees with them. So the clamp needs a
    // discriminator, and the obvious candidate from the sample is whether the block is
    // the LAST in the document -- every one of the eleven is a final block with no
    // the LAST in the document -- every one of the eleven is a final block.
    //
    // THAT HYPOTHESIS IS ALSO REFUTED, and the numbers are worth keeping because they
    // point the opposite way to the sample:
    //
    //     baseline                 26
    //     clamp every block        70
    //     clamp only final blocks  77
    //
    // Clamping only the final block is WORSE than clamping all of them, so clamping
    // the non-final ones must help by about seven. Being final is therefore not the
    // discriminator -- it is closer to an anti-discriminator -- and both subsets are
    // mixed. The eleven sampled cases are all final blocks that want the content end,
    // yet final blocks as a group want the mdast end more often than not, so the real
    // rule is about the block's TYPE or its content rather than its position. Dump the
    // 26 by node type before the next attempt; a 14-case sample chosen for brevity
    // over-represented unclosed math and single-item lists.
    //
    // Dumped by type, and a THIRD hypothesis is refuted. The 26 group as 14 `list` END,
    // 5 `heading` START, 3 `math` END, 2 `paragraph` END, 1 `footnoteDefinition` END and
    // 1 lone-CR paragraph. Ending a LIST section at its last item -- the rule already
    // shipped for `itemEnd`, and the type holding 14 of the 26 -- takes the ceiling
    // 26 -> 55. Three attempts, all worse than doing nothing:
    //
    //     baseline                  26
    //     clamp every block         70
    //     clamp only final blocks   77
    //     clamp only list blocks    55
    //
    // So the discriminator is not position and not node type. Most matching `list`
    // sections want mdast's end and only fourteen want the item end, which means it
    // turns on something INSIDE the list -- every one of the fourteen has an unclosed
    // or straddling construct in its last item (`$$y`, `~~~~del~~`, an indented `%%`,
    // a fence that outlives the item). That is the next thing to test, and it should be
    // tested as a PREDICATE over the 26 before being written as code.
    //
    // Stopped here deliberately: three consecutive refutations on one key means the
    // hypotheses are coming from the shape of the sample rather than from a rule.
    //
    // Two of the fourteen are different rules and should not be folded in:
    // `probe/line-ending/lone-cr` (`a\rb\r`) is `paragraph@0:0-1:1` against our
    // `0:0-0:3`, a lone-CR line-ending question, and one
    // `commonmark/link-reference-definitions` case differs on the START line, not the
    // end: `heading@1:0-2:3` against our `heading@0:0-2:3`.
    // THE CROSS-KEY HYPOTHESIS DID NOT TRANSFER, which is the useful result. The same
    // content-end rule that took `listItems` 55 -> 41 was retried here with `itemEnd`
    // now correct -- a legitimate retry, since the earlier 26 -> 55 was measured while
    // `itemEnd` still reported mdast's over-extended end. It is better and still wrong:
    //
    //     clamp every block                        70
    //     clamp only final blocks                  77
    //     list sections end at last item (old)     55
    //     list sections end at last item (fixed)   42
    //
    // Four attempts, all above the baseline of 26. So `listItems` and `sections` use
    // DIFFERENT conventions for the same list node: an item ends at its content and the
    // section containing it does not. That is worth knowing before a fifth attempt --
    // the 14 `list` END rows here are not the same rule as the 19 that were just fixed
    // one key over, however similar the examples look.
    sections: 26,
    // 116 -> 31. 94 of the 116 were an ordinary markdown link this projection never
    // collected -- it only ever walked `wikilink` nodes -- and not one was a link we
    // invented, which is the shape of a missing collector rather than a parse bug.
    //
    // The 31 remaining are attributed and are three separate things:
    //
    //   - FIXED, 13 of them: a trailing BACKSLASH in a wikilink's heading survives into
    //     the DISPLAY text but not into the target -- `[[a#h\]]` resolves to `a#h` and
    //     displays `a > h\`. The tokenizer resolves the escape, so the node's `heading`
    //     has already lost it and only the source still knows.
    //   - FIXED: a trailing `#` with no heading after it stays in the TARGET, so
    //     `[[page#]]` resolves to `page#` and not `page`. Tested before the first `|`,
    //     because a `#` inside an ALIAS belongs to the display -- `[[a|b#c]]` and
    //     `[[a|#b]]` both resolve to `a`, and a predicate over the whole inner text
    //     would have moved those two controls as well.
    //   - FIXED, 6 of them plus the whole of `tags`: a link, embed or tag inside a `%%`
    //     comment IS indexed, and this collector returned SKIP on a comment node. The
    //     delta the note asked for came back clean. All eight corpus cases holding one
    //     inside a comment report it, six reported nothing here, and not one was an
    //     entry we invented -- the same missing-collector signature as the markdown link
    //     and the markdown image. Consistent with the recorded asymmetry: a DEFINITION
    //     inside a comment does not define, a reference does.
    links: 11,
    // 31 -> 16 -> 6. First the missing collector (a markdown image was never indexed at
    // all), then the display field: the cache reports an image's alt as WRITTEN, not as
    // rendered, so it keeps a nested construct's brackets. `![foo [bar](u)](v)` displays
    // `foo [bar](u)` where mdast's flattened `alt` gives `foo bar`, and
    // `![alt [^9]](/url)` displays `alt [^9]` against our `alt `. Sliced from the source
    // between the opener and the LAST `](`, since the alt may hold one itself.
    embeds: 5,
    tags: 0,
    // 16, below the 17 it sat at before the probe wave: the wave settled the escaped
    // block identifier and the fix closed eleven cases, its own eight included.
    //
    // Attributed, and it carries the same signature `links` did -- 14 we-miss against
    // ZERO we-invent, which is a missing rule rather than a wrong one. Two clusters:
    //
    //   A block id ALONE on its own line, naming the block above it across a blank
    //   line. Five cases, and the recorded spans make it more than a collector change:
    //   the identifier takes the PRECEDING BLOCK'S span, and its own line yields no
    //   section at all.
    //
    //       'x' / '' / '^b'                 blocks b@0:0-0:1   sections [paragraph@0:0-0:1]
    //       '- x' / '' / '^b'               blocks b@0:0-0:3   sections [list@0:0-0:3]
    //       '> quoted' / '' / '^quote-id'   blocks quote-id@0:0-0:17  sections [blockquote@...]
    //       '| x |' / '| --- |' / '' / '^b' blocks b@0:0-1:7   sections [table@0:0-1:7]
    //       '^blk' / '</div>'               blocks blk@0:0-0:4 sections [paragraph, html]
    //
    //   LANDED: the rule is two sub-rules, which `probe/block-id-extent/*` settles.
    //   When the next block ABUTS the identifier's paragraph -- starts on the very next
    //   line, which only a construct that interrupts a paragraph can do -- that
    //   paragraph survives as a section and names itself. Otherwise it is CONSUMED: it
    //   leaves `sections` and names the block before it, or nothing when there is none.
    //   Closed 6 rows here and 6 on `sections`, confirming the coupling rather than
    //   assuming it.
    //
    //   We require the identifier to trail the block's own lines, so a standalone one
    //   registers nothing.
    //
    //   An escaped label in a bracket context: `[[\[^1]`, `[\[^1]]]`, `[^1](u)` and
    //   `[^[[a#` / `\[^1]`. Four cases. `\[^1` registering a block id is already
    //   implemented, but the rule does not reach inside a wikilink or a bracket pair.
    //
    //   Narrowed once already, so start from here. BRACKETED_BLOCK_ID matches all four
    //   values, and `stripBlockIds` is NOT the place -- that one strips the identifier
    //   from the TEXT projection and is working correctly. What misses is the `blocks`
    //   collector, which reads a block's own LINES rather than node values, so it needs
    //   the same escaped-bracket allowance the text stripper already applies when it
    //   checks that the source slice ends with a backslash before the match.
    // 16 -> 15. Cluster B's cause was an internal inconsistency, not a missing rule:
    // the identifier scan rejected any candidate whose tail was not an emphasis marker,
    // so a `]` run never reached the escaped-bracket gate written for it -- making
    // `closersAfter` and `bracketStillOpen` unreachable for exactly those cases. Letting
    // a closer run through fixed three of the four under `all-features`
    // (`fuzz/inline-footnote/4`, `probe/escaped-label/in-wikilink`, `.../in-brackets`)
    // while the ceiling, which scores the better profile, moved by one.
    //
    // `[^1](u)` stays: Obsidian registers `1` there with NO backslash, because the
    // bracket becomes a link rather than a footnote reference and so never claims the
    // caret. That is a tree question and this collector reads lines, so it needs a
    // different mechanism than the escape check.
    blocks: 8,
    // 71, of which 44 are span-only and they do NOT share one rule -- measured, after
    // "Obsidian ends an item at its last content character and we run on to the next
    // line start" was recorded here from two examples. It holds for 34. The other 10
    // invert it, with Obsidian ending LATER than us: `fuzz/footnote/18` is 0:6-1:4
    // against our 0:6-0:7, `callout/nested-task-list` 1:2-3:20 against 1:2-1:18, and
    // `probe/space-line/in-list` 0:0-1:0 against 0:0-0:3. That last one also kills the
    // rule's premise, since 1:0 is itself a next-line start. So an item's end is at
    // least two rules -- one where we overrun and one where we stop short of a blank or
    // space-only line the item absorbs -- and it wants its own probe family before any
    // of it is implemented. A blanket "end at the last content character" regresses the 10.
    // The 44 SPAN rows are ONE rule with three branches, not the "two opposing rules"
    // recorded earlier, and it is derivable from probes already in the corpus --
    // `probe/list-item/*`, `probe/empty-container/*` and `probe/space-line/*` hold 20
    // cases with recorded `listItems`, so no new recording is needed:
    //
    //     '- a' / '- b'          0:0-0:3   immediately followed -> last content char
    //     '- a' / '  - b'        0:0-0:3   a nested child is EXCLUDED
    //     '-  ' / ' '            0:0-0:3   nothing follows -> last content char
    //     '-' / '' / '- b'       0:0-1:0   blank separates it from a SIBLING ->
    //                                      the start of that blank line
    //     '- a' / ' ' / '- b'    0:0-1:0   a space-only line counts as blank
    //     '- a' / '' / '  foo'   0:0-2:5   blank, but the content is ABSORBED, so the
    //                                      item runs to the absorbed end instead
    //
    // That one rule explains the split in BOTH directions, which is why it read as two:
    // the 34 where we end later are the last-content-char branch, and the 10 where
    // Obsidian ends later are the blank-separated branch. `itemEnd` in `normalize.ts`
    // already implements the nested-child exclusion and needs the other two branches.
    //
    // The blank branch LANDED once its trigger was narrowed, and the first attempt is
    // worth keeping as the measurement: implementing it as "a blank or space-only line
    // with ANY content after it" took this ceiling 64 -> 97, a 33-case regression,
    // because `- a` / '' / `para` has a blank and a following BLOCK and a block does
    // not move the end. The SIBLING is the trigger. `-  ` / ' ' has no sibling either,
    // which is why it stays at 0:3 with a blank line beneath it. 64 -> 59 with the
    // narrow version; the nested-child exclusion was already there.
    // The 18 we-INVENT rows are attributed and are NOT the span question above:
    //
    //   2  FIXED: items inside a `%%` comment were counted, where the `links`, `tags`
    //      and `blocks` collectors already skipped them. `probe/straddle-fold/
    //      list-under-definition` looked like a third and is not -- `[^1]: ==a` /
    //      `2. b==` is a highlight fold, not a comment, so it stays open.
    //   5 of 6 FIXED, and the cause was neither the tab nor the parse. `parent` is a
    //      LINE NUMBER in Obsidian's cache, so nesting that happens *within* one line
    //      cannot be expressed -- `*\t*\t*` is three items all on line 0 and Obsidian
    //      reports `parent:-1` for all three. The legacy arbiter nests it exactly as we
    //      do, three levels deep, so the tree was right and this projection was
    //      over-reporting what the field can hold. One case in the family remains.
    //   1  `- [] a` / `- [ ]x`, a task-character difference.
    // The 59 break down by first difference as 21 START, 16 END (ours at column 0),
    // 8 MARKER, 7 PARENT, 4 END (other) -- so at least five rules, not one.
    //
    //   START   `- Item one` / `    - Nested item` is `1:2` to Obsidian with the marker
    //           at column 4, which looks like the content-column convention already
    //           shipped for definitions and headings.
    //   PARENT  `- [ ] 1.` is `parent:0` to Obsidian and `parent:-1` here, so the
    //           reading-view task re-parse nests where we leave the items siblings.
    //   MARKER  FIXED: a checkbox with no content after it on its own line is not a
    //           task -- `- [ ]` over `![[*` reports the plain marker `-`, not `" "`.
    //           Measured on BOTH sides of the predicate this time, which is what the
    //           failed START attempt did not do: all 5 entries whose line ends right
    //           after the checkbox report a plain marker, 0 report a task, and of the 86
    //           entries with content after the checkbox, 76 report a task. 59 -> 55.
    //
    // START is PARTLY FIXED, and the two attempts are worth keeping side by side.
    //
    // The first reported a nested item at its parent's content column unconditionally
    // and took the ceiling 59 -> 65. Its blast-radius check was not a measurement: it
    // counted the agreeing nested entries and their start columns (1, 2, 4, 6) and then
    // INFERRED those equal the parent's content column because they agree.
    //
    // The real predicate, computed over every nested entry Obsidian reports, is that 37
    // of 44 have the start equal to the parent's content column. All 7 exceptions are
    // accounted for: 4 are a same-line task re-parse (`- [ ] 1.`, where Obsidian reports
    // the marker column 6 and not the parent's 2), 2 are tab-indented and counted in
    // characters, and the seventh was my own separator bug -- `1.  foo` puts content at
    // column 4, not 3. Excluding the first two and fixing the third takes 41 -> 38.
    //
    // So the remaining START rows are NOT this rule; they need their own pass.
    // The END (ours at column 0) group is FIXED, and the both-sides measurement is what
    // made it possible:
    //
    //     entries where our end is at column 0, and obs AGREES :  9
    //     entries where our end is at column 0, and obs differs : 19
    //
    // Clamping all of them would fix 19 and break 9 -- the same trap the three
    // `sections` attempts fell into, which is why those measured 70, 77 and 55 against
    // a baseline of 26. The nine are the blank-separated siblings, where column 0 is
    // the right answer, so the clamp belongs only on the FALLBACK path after the
    // blank-separated branch has declined. Structural, not a heuristic about unclosed
    // constructs. 55 -> 41.
    listItems: 38,
    // 7 -> 2: Obsidian reports no position at all unless the block parses as a
    // non-empty YAML mapping, and we reported one for any `---` block. The five closed
    // were an empty block, a bare scalar, an unterminated quote and duplicate keys.
    frontmatterPosition: 2,
  };

  it("diverges on no more cases than the recorded ceiling", () => {
    const counts: Record<string, number> = Object.fromEntries(
      KEYS.map((key) => [key, 0]),
    );
    for (const keys of diverged.values()) {
      for (const key of keys) counts[key] = (counts[key] ?? 0) + 1;
    }
    expect(counts).toEqual(CEILING);
  });

  it("reproduces the inline footnote naming the probes established", () => {
    const of = (markdown: string) =>
      computeOurs(
        parseOurs(markdown, "quartz-default"),
        applyTextTransform(markdown),
      );
    // The name counts every inline footnote in document order and does not
    // restart in a new block; an empty body is a reference, and takes a number.
    expect(of("^[one] and ^[two]\n").footnotes).toEqual([
      "[inline0@0:2-0:5",
      "[inline1@0:13-0:16",
    ]);
    expect(of("^[a]\n\n^[b]\n").footnotes).toEqual([
      "[inline0@0:2-0:3",
      "[inline1@2:2-2:3",
    ]);
    expect(of("^[] and ^[x]\n")).toMatchObject({
      footnotes: ["[inline1@0:10-0:11"],
      footnoteRefs: ["@0:0"],
    });
    // A whitespace body is a body: only a truly empty one is a reference.
    expect(of("^[ ]\n")).toMatchObject({
      footnotes: ["[inline0@0:2-0:3"],
      footnoteRefs: [],
    });
  });
});
