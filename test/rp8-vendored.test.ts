/**
 * The vendored remark-parse 8 reads every document exactly as the published one does.
 *
 * `src/rp8/vendor` is remark-parse 8.0.3, remark-footnotes 2.0.0, remark-math 3.0.1 and
 * parse-entities 2.0.0 converted to ESM, with their helper packages inlined and any speed-up
 * applied in place. None of that may change a reading, so this builds both parsers STOCK --
 * the published packages from the `remarkParse8` / `remarkFootnotes2` / `remarkMath3` dev
 * dependencies, and the vendored copies -- with the options the legacy reader uses, and
 * requires byte-identical trees (positions included) on every document either corpus holds,
 * plus the pathological-input shapes at sizes the published parser can still finish.
 *
 * Obsidian's own readers are deliberately absent on both sides: they are this package's code
 * and are registered identically either way, so including them would only test them twice.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import Parser8 from "../src/rp8/vendor/remark-parse/parser.js";
import remarkFootnotes2 from "../src/rp8/vendor/remark-footnotes/index.js";
import remarkMath3 from "../src/rp8/vendor/remark-math/index.js";
import { SHAPES } from "./pathological/shapes.js";
import { tag, openCloseTag } from "../src/rp8/vendor/remark-parse/util/html.js";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

type ParserClass = new (doc: string, file: unknown) => { parse(): unknown };

/** remark-parse 8 with the legacy reader's options and plugins, nothing of Obsidian's. */
function build(
  Stock: ParserClass,
  footnotes: unknown,
  math: unknown,
): (doc: string) => string {
  class Local extends (Stock as new (...args: unknown[]) => object) {}
  const tables = Local.prototype as Record<string, unknown>;
  tables.options = { ...(tables.options as object), commonmark: true };
  for (const key of ["blockTokenizers", "inlineTokenizers"]) {
    tables[key] = { ...(tables[key] as object) };
  }
  for (const key of [
    "blockMethods",
    "inlineMethods",
    "interruptParagraph",
    "interruptList",
    "interruptBlockquote",
  ]) {
    tables[key] = (tables[key] as unknown[]).slice();
  }
  const host = { Parser: Local };
  (math as (this: unknown, o: object) => void).call(host, {});
  (footnotes as (this: unknown, o: object) => void).call(host, {
    inlineNotes: true,
  });
  return (doc) => {
    const file = {
      toString: () => doc,
      message: () => undefined,
      fail: (error: Error) => {
        throw error;
      },
    };
    return JSON.stringify(
      new (Local as unknown as ParserClass)(doc, file).parse(),
    );
  };
}

const published = build(
  (require("remarkParse8") as { Parser: ParserClass }).Parser,
  require("remarkFootnotes2"),
  require("remarkMath3"),
);
const vendored = build(
  Parser8 as unknown as ParserClass,
  remarkFootnotes2,
  remarkMath3,
);

function corpus(): Array<[string, string]> {
  const docs: Array<[string, string]> = [];
  const goldens = JSON.parse(
    fs.readFileSync(
      path.join(here, "parity", "goldens", "obsidian.json"),
      "utf8",
    ),
  ) as { cases: Record<string, { markdown: string }> };
  for (const [id, entry] of Object.entries(goldens.cases)) {
    docs.push([id, entry.markdown]);
  }
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

describe("vendored remark-parse 8", () => {
  it("reads every corpus document exactly as the published packages do", () => {
    const docs = corpus();
    expect(docs.length).toBeGreaterThan(10_000);
    const differ = docs
      .filter(([, text]) => published(text) !== vendored(text))
      .map(([id]) => id);
    expect(differ).toEqual([]);
  }, 120_000);

  it("reads the pathological shapes exactly as the published packages do", () => {
    const differ: string[] = [];
    for (const [name, shape] of Object.entries(SHAPES)) {
      // Small enough for the published parser's superlinear paths to finish.
      const text = shape(40);
      if (published(text) !== vendored(text)) differ.push(name);
    }
    expect(differ).toEqual([]);
  }, 120_000);

  /**
   * The one place the vendored code is NOT the published code: `util/html.js`'s tag
   * expressions backtrack exponentially (`recheck`: a 205-character string took 134 s), so they
   * are replaced by a linear automaton. These hold it to the published expressions directly,
   * on inputs short enough for those to finish.
   */
  describe("the linear tag matcher", () => {
    const html = require("remarkParse8/lib/util/html.js") as {
      tag: RegExp;
      openCloseTag: RegExp;
    };
    const publishedBlock = new RegExp(html.openCloseTag.source + "\\s*$");
    const vendoredBlock = (line: string) => {
      // html-block.ts: the tag, then only whitespace to the end of the line.
      const end = (
        tag as unknown as { [Symbol.match]: (v: string) => string[] | null }
      )[Symbol.match](line);
      return (
        openCloseTag.test(line) &&
        end !== null &&
        /^\s*$/.test(line.slice(end[0]!.length))
      );
    };
    const agree = (value: string): boolean =>
      JSON.stringify(value.match(html.tag)?.[0] ?? null) ===
        JSON.stringify(value.match(tag as unknown as RegExp)?.[0] ?? null) &&
      publishedBlock.test(value) === vendoredBlock(value);

    it("matches the published expressions at every `<` in the corpus", () => {
      const differ: string[] = [];
      let checked = 0;
      for (const [id, text] of corpus()) {
        for (
          let at = text.indexOf("<");
          at !== -1;
          at = text.indexOf("<", at + 1)
        ) {
          const end = text.indexOf("\n", at);
          const rest = text
            .slice(at, end === -1 ? undefined : end)
            .slice(0, 120);
          checked++;
          if (!agree(rest)) differ.push(`${id}@${at}: ${JSON.stringify(rest)}`);
        }
      }
      expect(checked).toBeGreaterThan(1_000);
      expect(differ).toEqual([]);
    }, 120_000);

    it("matches the published expressions on generated tag shapes", () => {
      // Every character the grammar distinguishes, including U+00A0, which `\s` matches
      // and an unquoted value may also hold -- the one real ambiguity in the grammar.
      const alphabet = [
        "<",
        ">",
        "/",
        "=",
        " ",
        "\t",
        "\u00a0",
        "a",
        "B",
        ":",
        "-",
        "_",
        ".",
        "'",
        '"',
        "`",
        "1",
        "!",
        "?",
        "[",
        "x",
      ];
      let seed = 0x2545f491;
      const random = () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return (seed >>> 0) / 0x100000000;
      };
      const differ: string[] = [];
      for (let n = 0; n < 300_000; n++) {
        let value = random() < 0.5 ? "<a" : "<";
        const length = 1 + Math.floor(random() * 14);
        for (let i = 0; i < length; i++) {
          value += alphabet[Math.floor(random() * alphabet.length)];
        }
        if (!agree(value)) differ.push(JSON.stringify(value));
        if (differ.length > 10) break;
      }
      expect(differ).toEqual([]);
    }, 120_000);

    it("settles the published expressions' own attack string in linear time", () => {
      const attack = "<A\t: " + "=  : : ".repeat(28) + "'>\">";
      const started = performance.now();
      openCloseTag.test(attack);
      (tag as unknown as { [Symbol.match]: (v: string) => unknown })[
        Symbol.match
      ](attack);
      expect(performance.now() - started).toBeLessThan(50);
    });
  });
});
