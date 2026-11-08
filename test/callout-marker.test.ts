import fs from "node:fs";
import path from "node:path";

import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import remarkObsidian from "../src/index.js";
import { pointAt } from "../src/lib/normalize-points.js";
import { loadCorpus } from "./parity/classify.js";
import type { GoldenCase } from "./parity/types.js";

/**
 * `data.marker` and `data.lineEnd`: a callout's marker found without reading the source.
 *
 * Additive, so nothing that reads the title moves. What a consumer otherwise writes is
 * `locateByHand`, which is the corpus check's oracle.
 */
const golden = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "parity/goldens/obsidian.json"),
    "utf8",
  ),
) as { cases: Record<string, GoldenCase> };

function read(markdown: string, preset: "legacy" | "strict"): any {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, { preset });
  return processor.runSync(processor.parse(markdown), markdown);
}

function findAll(node: any, type: string, found: any[] = []): any[] {
  if (node.type === type) found.push(node);
  for (const child of node.children ?? []) findAll(child, type, found);
  return found;
}

/** Skip the quote marker from the callout's own start, then take the line's end. */
function locateByHand(
  source: string,
  from: number,
): { marker: number; lineEnd: number } {
  let marker = from;
  while (source[marker] === " " || source[marker] === "\t") marker++;
  if (source[marker] === ">") marker++;
  if (source[marker] === " ") marker++;
  let lineEnd = marker;
  while (
    lineEnd < source.length &&
    source[lineEnd] !== "\n" &&
    source[lineEnd] !== "\r"
  ) {
    lineEnd++;
  }
  return { marker, lineEnd };
}

describe.each(["legacy", "strict"] as const)(
  "a callout's marker under %s",
  (preset) => {
    const row = (markdown: string): [string, string] => {
      const [callout] = findAll(read(markdown, preset), "callout");
      const { marker, lineEnd } = callout.data;
      return [
        markdown.slice(marker.start.offset, marker.end.offset),
        markdown.slice(marker.end.offset, lineEnd.offset),
      ];
    };

    it.each([
      ["no title", "> [!note]\n> body\n", "[!note]", ""],
      ["no title, no line ending", "> [!note]", "[!note]", ""],
      ["a title", "> [!note] T\n", "[!note]", " T"],
      ["a fold character", "> [!note]- T\n", "[!note]-", " T"],
      ["a space in the type", "> [! note ]+\n", "[! note ]+", ""],
      ["spaces only after it", "> [!note]  \n", "[!note]", "  "],
      ["a tab after it", "> [!note]\tT\n", "[!note]", "\tT"],
      ["a block on its line", "> [!note] [^1]: def\n", "[!note]", " [^1]: def"],
      ["a code span title", "> [!note] `a`\n", "[!note]", " `a`"],
      ["inside a quote", "> > [!note] T\n", "[!note]", " T"],
      ["inside a list item", "- > [!note] T\n", "[!note]", " T"],
      ["below other text", "a\n\n> [!note] T\n", "[!note]", " T"],
      ["indented", "  > [!note] T\n", "[!note]", " T"],
      ["no space after `>`", ">[!note] T\n", "[!note]", " T"],
      ["`\\r\\n`", "a\r\n\r\n> [!note] T\r\n> b\r\n", "[!note]", " T"],
    ])("finds it with %s", (_name, markdown, marker, rest) => {
      expect(row(markdown)).toEqual([marker, rest]);
    });

    // `strict` forms no callout below a lone `\r`: its title line is found by `\n`.
    it.runIf(preset === "legacy")("finds it with a lone `\\r`", () => {
      expect(row("a\r\r> [!note] T\r> b\r")).toEqual(["[!note]", " T"]);
    });

    it("gives each point its line and column", () => {
      const markdown = "a\r\n\r\n> [!note] T\r\n";
      const [callout] = findAll(read(markdown, preset), "callout");
      expect(callout.data.marker.start).toEqual({
        line: 3,
        column: 3,
        offset: 7,
      });
      expect(callout.data.marker.end).toEqual({
        line: 3,
        column: 10,
        offset: 14,
      });
      expect(callout.data.lineEnd).toEqual({
        line: 3,
        column: 12,
        offset: 16,
      });
    });

    it("finds every callout in the corpus, where a consumer's own scan does", () => {
      const documents = [
        ...new Set([
          ...Object.values(golden.cases).map((entry) => entry.markdown),
          ...loadCorpus().map((row) => row.text),
        ]),
      ]
        .map((document) =>
          document.charCodeAt(0) === 0xfeff ? document.slice(1) : document,
        )
        .filter((document) => document.includes("[!"));
      let seen = 0;
      const offenders: string[] = [];
      for (const document of documents) {
        for (const source of [document, document.replace(/\r?\n/gu, "\r\n")]) {
          for (const callout of findAll(read(source, preset), "callout")) {
            seen += 1;
            const { marker, lineEnd } = locateByHand(
              source,
              callout.position.start.offset,
            );
            const data = callout.data;
            if (
              data?.marker?.start.offset !== marker ||
              data?.lineEnd?.offset !== lineEnd ||
              !source.startsWith("[!", marker) ||
              source[data.marker.end.offset - 1] === " "
            ) {
              offenders.push(
                `${JSON.stringify(source).slice(0, 60)} at ${callout.position.start.offset}`,
              );
              continue;
            }
            for (const point of [
              data.marker.start,
              data.marker.end,
              data.lineEnd,
            ]) {
              const expected = pointAt(source, point.offset);
              if (
                point.line !== expected.line ||
                point.column !== expected.column
              ) {
                offenders.push(`${JSON.stringify(source).slice(0, 60)} point`);
              }
            }
          }
        }
      }
      // A known count, so a check that stopped seeing callouts cannot pass.
      expect(seen).toBeGreaterThan(2000);
      expect(offenders).toEqual([]);
    }, 300_000);
  },
);
