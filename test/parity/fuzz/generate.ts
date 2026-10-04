import { Rng } from "./random.js";

/**
 * Grammar-aware generation, not random bytes.
 *
 * Random characters are useless against a Markdown parser: they essentially
 * never land on a delimiter boundary, so a million of them exercise less than
 * one hand-written case. What this does instead is compose *known* fragments
 * — real delimiters, real containers, real malformations — at random depth
 * and in random order.
 *
 * That is deliberately the one thing the generated corpus layers cannot do.
 * They cross each construct against each context and each adjacency, which is
 * exhaustive two-way coverage and blind to anything needing three constructs
 * to interact. Fuzzing is how n-way interactions get reached at all.
 */

/** Balanced inline constructs, each a delimiter pair the parser must pair up. */
const INLINE: ReadonlyArray<readonly [string, string, string]> = [
  ["[[", "]]", "target"],
  // The second-field forms, listed explicitly. They arose only by accident
  // before, at 0.9% and 2.8% of documents, and no seed count fixes a
  // distribution: these are exactly where the known divergences are.
  ["[[", "]]", "a|b"],
  ["[[", "]]", "a#h"],
  ["[[", "]]", "a#^blk"],
  ["![[", "]]", "img.png"],
  ["![[", "]]", "i.png|100"],
  ["![[", "]]", "i.png|100x200"],
  ["![[", "]]", "d.pdf#page=3"],
  ["==", "==", "mark"],
  ["%%", "%%", "note"],
  ["$", "$", "x^2"],
  ["$$", "$$", "y^2"],
  ["*", "*", "em"],
  ["**", "**", "strong"],
  ["_", "_", "under"],
  ["~~", "~~", "del"],
  ["^[", "]", "inline"],
  ["[^", "]", "1"],
  ["`", "`", "code"],
  ["[", "](u)", "link"],
];

/** Standalone inline atoms with no closer of their own. */
const ATOMS: readonly string[] = [
  "#tag",
  "#a/b",
  "word",
  "\u65e5\u672c\u8a9e",
  "&amp;",
  "<br>",
  "^blk",
  "https://e.test/p",
  // Unreachable before: nothing in the grammar could emit an autolink.
  "<https://e.test>",
  "<mailto:a@e.test>",
  "\u200b",
  "\u00a0",
];

/** What can sit between two fragments and change how they pair. */
const JOINERS: readonly string[] = [
  " ",
  "",
  "\n",
  ". ",
  ", ",
  " | ",
  "](",
  "\t",
  " \\ ",
  "\n\n",
];

/** Line prefixes, applied to every line of a block. */
const PREFIXES: readonly string[] = [
  "",
  "> ",
  "- ",
  "1. ",
  "- [ ] ",
  "# ",
  "> > ",
  "  ",
  "    ",
  "> [!note] ",
];

/** Whole-block shapes whose interior is generated separately. */
const BLOCKS: ReadonlyArray<(body: string) => string> = [
  (body) => body,
  (body) => "```\n" + body + "\n```",
  (body) => "```js\n" + body + "\n```",
  (body) =>
    "| a | b |\n| --- | --- |\n| " + body.replace(/\n/g, " ") + " | c |",
  (body) => "---\ntitle: x\n---\n\n" + body,
  (body) => "<div>\n" + body + "\n</div>",
  (body) => "[^1]: " + body.replace(/\n/g, "\n    "),
  (body) => body + "\n===",
  (body) => body + "\n---",
];

/** Ways to break a balanced pair, which is where parsers actually differ. */
function damage(rng: Rng, open: string, close: string, body: string): string {
  switch (rng.int(8)) {
    case 0:
      return open + body;
    case 1:
      return body + close;
    case 2:
      return open + open + body + close;
    case 3:
      return open + body + close + close;
    case 4:
      return open + close;
    case 5:
      return "\\" + open + body + close;
    case 6:
      return open + body + "\\" + close;
    default:
      return open + body + "\n" + body + close;
  }
}

function fragment(rng: Rng, depth: number): string {
  if (depth > 0 && rng.chance(0.3)) {
    const [open, close] = rng.pick(INLINE);
    return open + fragment(rng, depth - 1) + close;
  }
  if (rng.chance(0.3)) return rng.pick(ATOMS);

  const [open, close, body] = rng.pick(INLINE);
  return rng.chance(0.4) ? damage(rng, open, close, body) : open + body + close;
}

function line(rng: Rng): string {
  const parts: string[] = [];
  const count = rng.between(1, 4);
  for (let index = 0; index < count; index++) {
    if (index > 0) parts.push(rng.pick(JOINERS));
    parts.push(fragment(rng, rng.int(3)));
  }
  return parts.join("");
}

function block(rng: Rng): string {
  const prefix = rng.pick(PREFIXES);
  const lines = Array.from({ length: rng.between(1, 3) }, () => line(rng));
  const body = lines.map((text) => prefix + text).join("\n");
  return rng.pick(BLOCKS)(body);
}

/**
 * One document per seed, so a failing seed names exactly one case.
 *
 * Always ends in a newline: a file without one is its own edge case and is
 * covered deliberately elsewhere, so leaving it to chance here would make
 * unrelated seeds fail for the same already-known reason.
 */
export function generate(seed: number): string {
  const rng = new Rng(seed);
  const blocks = Array.from({ length: rng.between(1, 3) }, () => block(rng));
  return blocks.join("\n\n").replace(/\n+$/, "") + "\n";
}

export function generateRange(
  from: number,
  count: number,
): Array<[number, string]> {
  return Array.from({ length: count }, (_, index) => [
    from + index,
    generate(from + index),
  ]);
}
