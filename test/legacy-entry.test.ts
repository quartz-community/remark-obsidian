/**
 * `@quartz-community/remark-obsidian/legacy` reads what the main entry's `legacy` reads, and
 * leaves out what a consumer that only reads has no use for.
 *
 * The main entry stays the reference: `parse` is held to `unified().use(remarkObsidian, options)`
 * on every corpus document, so a change to either path that moves a tree fails here. A flag that
 * never reached the reader would agree too, so each one must also move some document.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import remarkObsidian from "../src/index.js";
import { parse, type LegacyParseOptions } from "../src/legacy.js";
import { strideSample } from "./parity/classify.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const FLAGS: Array<keyof LegacyParseOptions> = [
  "wikilinks",
  "highlights",
  "comments",
  "tags",
  "customTaskChars",
  "math",
  "frontmatter",
  "keepComments",
  "parseComments",
  "lineOffsets",
  "bareFootnoteRefs",
  "inlineFootnotes",
  "callouts",
  "positionedBreaks",
];

/** A note every flag above reads differently when it is off. */
const EVERY_FLAG = [
  "---",
  "a: 1",
  "---",
  "",
  "[[w]] ==h== #t $m$ ^[n] [^9] a %%c [^1] d%% b",
  "soft",
  "",
  "- [-] task",
  "",
  "> [!note] T",
  "",
].join("\n");

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

const mainEntry = (options?: LegacyParseOptions) => {
  const processor = unified().use(remarkObsidian, options).freeze();
  return (doc: string) => JSON.stringify(processor.parse(doc));
};
const subpath = (options?: LegacyParseOptions) => (doc: string) =>
  JSON.stringify(parse(doc, options));

const differing = (
  docs: Array<[string, string]>,
  a: (doc: string) => string,
  b: (doc: string) => string,
) => docs.filter(([, doc]) => a(doc) !== b(doc)).map(([id]) => id);

describe("the legacy entry", () => {
  const docs = corpus();

  it("reads every corpus document as the main entry does, by default", () => {
    expect(docs.length).toBeGreaterThan(10_000);
    expect(differing(docs, subpath(), mainEntry())).toEqual([]);
  }, 120_000);

  // A stride of the corpus: the 14 flags over all of it took four minutes, and agreed.
  const sample = strideSample(docs, 275);

  it("reads them as the main entry does with every option off, too", () => {
    const none = Object.fromEntries(
      FLAGS.map((flag) => [flag, false]),
    ) as LegacyParseOptions;
    expect(differing(sample, subpath(none), mainEntry(none))).toEqual([]);
  }, 120_000);

  it.each(FLAGS)(
    "honours %s as the main entry does",
    (flag) => {
      const off = { [flag]: false } as LegacyParseOptions;
      expect(differing(sample, subpath(off), mainEntry(off))).toEqual([]);
      // The known-positive control: an option that never reached the reader agrees above as well.
      expect(subpath(off)(EVERY_FLAG)).not.toBe(subpath()(EVERY_FLAG));
      expect(subpath(off)(EVERY_FLAG)).toBe(mainEntry(off)(EVERY_FLAG));
    },
    120_000,
  );

  it("keeps a byte order mark's and CRLF's handling", () => {
    const mark = String.fromCharCode(0xfeff);
    for (const doc of [
      `${mark}a[^1]\n\n[^1]: b\n`,
      "a[^1]\r\n\r\n[^1]: b\r\n",
    ]) {
      expect(subpath()(doc)).toBe(mainEntry()(doc));
    }
  });

  // tsup bundles what the entry reaches, so this is the same answer `dist/legacy.js` gives. An
  // exact list on purpose: a new package here is a size decision, not an accident.
  it("bundles none of strict's chain, the writers, or unified", async () => {
    const { metafile } = await build({
      entryPoints: [path.join(here, "..", "src", "legacy.ts")],
      bundle: true,
      format: "esm",
      metafile: true,
      platform: "node",
      target: "es2022",
      write: false,
      outfile: "legacy.js",
    });
    const packages = new Set<string>();
    for (const output of Object.values(metafile.outputs)) {
      for (const [file, { bytesInOutput }] of Object.entries(output.inputs)) {
        const name = /node_modules\/((?:@[^/]+\/)?[^/]+)/u.exec(file)?.[1];
        if (name !== undefined && bytesInOutput > 0) packages.add(name);
      }
    }
    expect([...packages].sort()).toEqual([
      "character-entities",
      "decode-named-character-reference",
      "micromark-util-decode-numeric-character-reference",
      "micromark-util-decode-string",
      "micromark-util-normalize-identifier",
      "unist-util-is",
      "unist-util-visit",
      "unist-util-visit-parents",
    ]);
  });
});
