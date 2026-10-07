import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseOurs } from "./chain.js";
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
    const ours = computeOurs(
      parseOurs(golden.markdown, profile),
      golden.markdown,
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
   * The first two are `P1`, where a fix would be a regression: Obsidian's cache
   * reports a column short by the width of a `%%` marker. The other two are gaps
   * we intend to close, tracked `replicate`, and they are one rule seen from both
   * sides -- a `[` right after a link text's `]` opens a link label, so it is
   * neither a wikilink opener nor the start of a footnote reference. Closing it
   * means tokenizer precedence between the wikilink extension and CommonMark's
   * link label, so it is not a repair pass, and the referee measures the family at
   * 44 of 6806 documents.
   */
  const KNOWN_REFERENCE_GAPS = [
    "hunt/aftercloser-chain-eats-referenced-definition/0: P1, Obsidian's column is short by the `%%` marker",
    "hunt/continuation-masked-under-foreign-label/2: P1, Obsidian's column is short by the `%%` marker",
    "probe/reference-in-link/collection-label: we claim a wikilink where the label holds the reference",
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
  const CEILING = {
    footnotes: 19,
    footnoteRefs: 3,
    headings: 18,
    sections: 136,
    links: 119,
    embeds: 33,
    tags: 3,
    blocks: 14,
    listItems: 71,
    frontmatterPosition: 7,
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
      computeOurs(parseOurs(markdown, "quartz-default"), markdown);
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
