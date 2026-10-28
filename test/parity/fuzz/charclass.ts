import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import remarkObsidian from "../../../src/index.js";
import { applyTextTransform, PROFILES } from "../chain.js";
import { computeOurs } from "../normalize.js";
import type { ComputedMeta } from "../types.js";
import { Rng } from "./random.js";

/**
 * Character classes, swept against Obsidian.
 *
 * The grammar fuzz composes known fragments from a fixed alphabet, so a construct's CHARACTER
 * rule is never varied: its only tag atoms were `#tag` and `#a/b`, and nothing it could emit
 * holds `#a§b`. That is how a tag class rejecting 66 of 163 characters Obsidian accepts went
 * unseen until issue #1's closing note. This puts one character at a time into a slot inside
 * each construct whose reading depends on what the character is, and compares the
 * `metadataCache` facts Obsidian records with ours, under both presets.
 */
export interface Template {
  readonly name: string;
  /** The document holding `c` in the construct's slot. */
  readonly build: (c: string) => string;
  /** The `metadataCache` keys whose answer the character decides. */
  readonly keys: ReadonlyArray<keyof ComputedMeta>;
}

export const TEMPLATES: readonly Template[] = [
  { name: "tag", build: (c) => `x #a${c}b y\n`, keys: ["tags"] },
  { name: "tag-start", build: (c) => `x #${c}b y\n`, keys: ["tags"] },
  { name: "block-id", build: (c) => `x ^a${c}b\n`, keys: ["blocks"] },
  {
    name: "footnote-label",
    build: (c) => `x[^a${c}b] y\n\n[^a${c}b]: d\n`,
    keys: ["footnotes", "footnoteRefs"],
  },
  { name: "wikilink", build: (c) => `x [[a${c}b]] y\n`, keys: ["links"] },
  { name: "embed", build: (c) => `x ![[a${c}b]] y\n`, keys: ["embeds"] },
  {
    name: "callout-type",
    build: (c) => `> [!a${c}b] T\n> x\n`,
    keys: ["sections"],
  },
  { name: "task-box", build: (c) => `- [${c}] x\n`, keys: ["listItems"] },
];

/** Every code point in `[low, high]` the sample may draw, as strings. */
const span = (low: number, high: number): string[] =>
  Array.from({ length: high - low + 1 }, (_, i) =>
    String.fromCodePoint(low + i),
  );

/**
 * Characters that are always included: all printable ASCII, every kind of whitespace, and both
 * sides of each boundary a character rule here is known to turn on -- the General and
 * Supplemental Punctuation blocks, CJK symbols, full-width forms, joiners and selectors.
 */
const FIXED: readonly string[] = [
  ...span(0x21, 0x7e),
  "\t",
  "\u00a0",
  "\u1680",
  "\u2000",
  "\u200a",
  "\u200b",
  "\u200c",
  "\u200d",
  "\u2028",
  "\u202f",
  "\u2060",
  "\u3000",
  "\ufeff",
  "\u00ad",
  "\u1fff",
  "\u2010",
  "\u2019",
  "\u2026",
  "\u2030",
  "\u206f",
  "\u2070",
  "\u2dff",
  "\u2e00",
  "\u2e2e",
  "\u2e7f",
  "\u2e80",
  "\u3001",
  "\u3002",
  "\u300c",
  "\uff01",
  "\uff0c",
  "\ufe0f",
  "\u20e3",
  "\u00a7",
  "\u00b6",
  "\u00a9",
  "\u20ac",
  "\u2192",
  "\u2260",
  "\u2605",
  "\u{1f4da}",
  "\u{1f3fd}",
  "\u{1d400}",
  "\u{20000}",
];

/** Unicode general categories, each sampled at random every run. */
const CATEGORIES = [
  "Lu",
  "Ll",
  "Lt",
  "Lm",
  "Lo",
  "Mn",
  "Mc",
  "Me",
  "Nd",
  "Nl",
  "No",
  "Pc",
  "Pd",
  "Ps",
  "Pe",
  "Pi",
  "Pf",
  "Po",
  "Sm",
  "Sc",
  "Sk",
  "So",
  "Zs",
  "Cc",
  "Cf",
] as const;

/** A deterministic sample: `FIXED`, plus `perCategory` random code points of each category. */
export function sampleCharacters(seed: number, perCategory = 4): string[] {
  const rng = new Rng(seed);
  const picked = new Set(FIXED);
  for (const category of CATEGORIES) {
    const test = new RegExp(`^\\p{${category}}$`, "u");
    let found = 0;
    for (let tries = 0; found < perCategory && tries < 20_000; tries++) {
      // Mostly the BMP, sometimes an astral plane, where surrogate handling lives.
      const point = rng.chance(0.8)
        ? rng.int(0x10000)
        : rng.between(0x10000, 0x2ffff);
      if (point >= 0xd800 && point <= 0xdfff) continue;
      const c = String.fromCodePoint(point);
      if (test.test(c) && !picked.has(c)) {
        picked.add(c);
        found++;
      }
    }
  }
  // Line endings would change the document's shape, not test a character.
  return [...picked].filter((c) => c !== "\n" && c !== "\r");
}

/** Our facts for `markdown` under Quartz's options with `preset`. */
export function ourFacts(
  markdown: string,
  preset: "legacy" | "strict",
): ComputedMeta {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, {
      ...PROFILES["quartz-default"].remarkObsidian,
      preset,
    });
  const source = applyTextTransform(markdown);
  const tree = processor.runSync(processor.parse(source), source) as Root;
  return computeOurs(tree, source);
}

/** Down to lines, for `strict`, which makes no promise about columns (as `strict-syntax`). */
const toLines = (rows: readonly string[]): string[] =>
  rows
    .map((row) =>
      row
        .replace(/@(\d+):\d+-(\d+):\d+$/u, "@$1-$2")
        .replace(/@(\d+):\d+$/u, "@$1"),
    )
    .sort();

/** Where ours and Obsidian's facts differ, as `key: obsidian | ours`, under `preset`. */
export function disagreement(
  template: Template,
  obsidian: ComputedMeta,
  ours: ComputedMeta,
  preset: "legacy" | "strict",
): string[] {
  const out: string[] = [];
  for (const key of template.keys) {
    let theirs = [...((obsidian[key] as readonly string[] | undefined) ?? [])];
    let mine = [...((ours[key] as readonly string[] | undefined) ?? [])];
    if (preset === "strict") {
      theirs = toLines(theirs);
      mine = toLines(mine);
    }
    if (JSON.stringify(theirs) !== JSON.stringify(mine)) {
      out.push(`${key}: ${JSON.stringify(theirs)} | ${JSON.stringify(mine)}`);
    }
  }
  return out;
}
