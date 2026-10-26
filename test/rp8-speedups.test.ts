/**
 * The legacy reader's speed-ups change how fast a note is read and nothing about the reading.
 *
 * `src/rp8/reader.ts` remembers locator answers per inline run and indexes a run's backtick
 * runs, which is what keeps `backtick-increasing` and its kin inside the pathological-input
 * budget. Both rest on an argument about what each locator does; this holds them to the
 * reader without them, tree and offset table alike, on every corpus document and on the
 * pathological shapes at sizes the plain reader can still finish.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parse8WithOffsets, type Features } from "../src/rp8/reader.js";
import { SHAPES } from "./pathological/shapes.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const ALL: Features = {
  comments: true,
  callouts: true,
  wikilinks: true,
  frontmatter: true,
  math: true,
  highlights: true,
  tags: true,
  inlineFootnotes: true,
  customTaskChars: true,
  positionedBreaks: true,
};

const read = (doc: string, fast: boolean, features = ALL) =>
  JSON.stringify(parse8WithOffsets(doc, features, fast));

function corpus(): Array<[string, string]> {
  const docs: Array<[string, string]> = [];
  const goldens = JSON.parse(
    fs.readFileSync(
      path.join(here, "parity", "goldens", "obsidian.json"),
      "utf8",
    ),
  ) as { cases: Record<string, { markdown: string }> };
  for (const [id, entry] of Object.entries(goldens.cases))
    docs.push([id, entry.markdown]);
  const answers = path.join(here, "parity", "referee-answers");
  for (const name of fs
    .readdirSync(answers)
    .filter((f) => f.endsWith(".json"))) {
    const raw: unknown = JSON.parse(
      fs.readFileSync(path.join(answers, name), "utf8"),
    );
    const rows = (Array.isArray(raw) ? raw : Object.values(raw as object)) as {
      text: string;
    }[];
    rows.forEach((row, at) => docs.push([`${name}#${at}`, row.text]));
  }
  return docs;
}

describe("legacy reader speed-ups", () => {
  it("read every corpus document exactly as the plain reader does", () => {
    const docs = corpus();
    expect(docs.length).toBeGreaterThan(10_000);
    const differ = docs
      .filter(([, doc]) => read(doc, true) !== read(doc, false))
      .map(([id]) => id);
    expect(differ).toEqual([]);
  }, 120_000);

  it("read them identically with every Obsidian reader off, too", () => {
    const none = Object.fromEntries(
      Object.keys(ALL).map((k) => [k, false]),
    ) as unknown as Features;
    const differ = corpus()
      .filter(([, doc]) => read(doc, true, none) !== read(doc, false, none))
      .map(([id]) => id);
    expect(differ).toEqual([]);
  }, 120_000);

  it("read the pathological shapes exactly as the plain reader does", () => {
    const differ = Object.entries(SHAPES)
      .filter(([, shape]) => read(shape(60), true) !== read(shape(60), false))
      .map(([name]) => name);
    expect(differ).toEqual([]);
  }, 120_000);

  it("read generated documents exactly as the plain reader does", () => {
    // Every character a reader treats specially, so the early returns meet escaped openers,
    // backslash runs, nested and unmatched brackets, U+00A0, and code spans around them.
    const alphabet = "[]()<>@:/\\`^! \n\ta\u00a0*_$%=#|~-.1x".split("");
    let seed = 0x9e3779b9;
    const random = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 0x100000000;
    };
    const differ: string[] = [];
    for (let n = 0; n < 60_000 && differ.length < 5; n++) {
      let doc = "";
      const length = 1 + Math.floor(random() * 40);
      for (let i = 0; i < length; i++)
        doc += alphabet[Math.floor(random() * alphabet.length)];
      if (read(doc, true) !== read(doc, false))
        differ.push(JSON.stringify(doc));
    }
    expect(differ).toEqual([]);
  }, 120_000);
});
