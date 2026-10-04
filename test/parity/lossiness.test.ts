import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { visit } from "unist-util-visit";
import type { Root, Text } from "mdast";

import { parseOurs } from "./chain.js";
import type { GoldenCase } from "./types.js";

const goldenPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "goldens",
  "obsidian.json",
);

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

const decodeReferences = (value: string): string =>
  value.replace(
    /&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]*));/gi,
    (whole, hex: string, dec: string, name: string) => {
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (dec) return String.fromCodePoint(Number(dec));
      return ENTITIES[name.toLowerCase()] ?? whole;
    },
  );

/**
 * Escapes, character references and blockquote markers are the only things
 * that legitimately separate a `text` node's value from its own source slice.
 * Whitespace goes too, since a node spanning a line break loses container
 * indentation that was never content.
 */
const contentOf = (value: string): string =>
  decodeReferences(value.replace(/\\([!-/:-@[-`{-~])/g, "$1"))
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/\s+/g, "");

/**
 * The characters a node's span claims but its value does not reproduce. Empty
 * unless the value is a strict subsequence of the slice, so a node that merely
 * differs is not mistaken for one that drops content.
 */
const droppedBy = (slice: string, value: string): string => {
  const source = contentOf(slice);
  const kept = contentOf(value);
  let index = 0;
  let dropped = "";
  for (const character of source) {
    if (index < kept.length && kept[index] === character) index++;
    else dropped += character;
  }
  return index === kept.length ? dropped : "";
};

const lossyNodesIn = (tree: Root, markdown: string): string[] => {
  const found: string[] = [];
  visit(tree, "text", (node: Text) => {
    const { start, end } = node.position ?? {};
    if (start?.offset == null || end?.offset == null) return;
    const dropped = droppedBy(
      markdown.slice(start.offset, end.offset),
      node.value,
    );
    if (dropped.length > 0) found.push(dropped);
  });
  return found;
};

const lossyIn = (markdown: string): string[] =>
  lossyNodesIn(parseOurs(markdown, "quartz-default"), markdown);

const MARKER = /\[\^[^[\]\s]+\]/g;

/**
 * Every footnote marker the tree still carries, lowercased because mdast
 * lowercases an identifier. A reference and a definition each reconstruct
 * theirs from the node; anything left as prose is found in the literal value.
 */
const markersIn = (tree: Root): Set<string> => {
  const kept = new Set<string>();
  visit(tree, (node: Root | { type: string }) => {
    const candidate = node as {
      type: string;
      identifier?: string;
      label?: string;
      value?: string;
      meta?: string;
    };
    if (
      candidate.type === "footnoteReference" ||
      candidate.type === "footnoteDefinition"
    ) {
      const name = candidate.label ?? candidate.identifier ?? "";
      kept.add(`[^${name}]`.toLowerCase());
    }
    // `meta` as well as `value`: a `$$ b [^3]` fence puts everything after the
    // opener in the info string, where the marker is still present.
    for (const text of [candidate.value, candidate.meta]) {
      if (typeof text !== "string") continue;
      for (const marker of text.match(MARKER) ?? [])
        kept.add(marker.toLowerCase());
    }
  });
  return kept;
};

/**
 * A `text` node carries no delimiters of its own, so its value must reproduce
 * its own source slice. A value that silently drops characters makes the node
 * lie about the span it claims, and a formatter that serialises this tree then
 * writes the shorter text back over the longer source. Obsidian drops
 * characters when *rendering* several constructs, but Obsidian only
 * mis-displays -- the file on disk keeps its text. Reproducing such a drop
 * belongs in the comparison projection, never in a node value.
 */
describe("source fidelity", () => {
  const file = JSON.parse(fs.readFileSync(goldenPath, "utf8")) as {
    cases: Record<string, GoldenCase>;
  };
  const cases = Object.values(file.cases);

  const lossy = new Map<string, string[]>();
  for (const entry of cases) {
    const dropped = lossyIn(entry.markdown);
    if (dropped.length > 0) lossy.set(entry.id, dropped);
  }

  it("audits the whole corpus", () => {
    expect(cases.length).toBeGreaterThan(1000);
  });

  it("never drops a source character from a text node", () => {
    const offenders = [...lossy].map(
      ([id, dropped]) => `${id}: ${JSON.stringify(dropped)}`,
    );
    expect(offenders).toEqual([]);
  });

  it("keeps a footnote reference lossless, defined or not", () => {
    expect(lossyIn("a[^1]\n\n[^1]: x\n")).toEqual([]);
    expect(lossyIn("a[^1]\n")).toEqual([]);
  });

  /**
   * The span check above is a proxy: a parse could satisfy it by emitting
   * nodes with no position at all. This measures the property itself, so the
   * two cannot be traded against each other -- every `[^label]` the source
   * wrote must still be reachable in the tree, whether it survived as a
   * reference, a definition, or literal text.
   */
  it("keeps every footnote marker in the corpus reachable", () => {
    const lost: string[] = [];
    for (const entry of cases) {
      // A marker preceded by `^` is the tail of an inline footnote opener, not
      // a reference: `^[^9]` is one `^[...]` whose body is the text `^9`, so
      // the source substring `[^9]` is never a marker to preserve.
      const written = [...entry.markdown.matchAll(MARKER)]
        .filter((match) => entry.markdown[match.index - 1] !== "^")
        .map((match) => match[0]);
      if (written.length === 0) continue;
      const kept = markersIn(parseOurs(entry.markdown, "quartz-default"));
      const missing = written.filter(
        (marker) => !kept.has(marker.toLowerCase()),
      );
      if (missing.length > 0) lost.push(`${entry.id}: ${missing.join(" ")}`);
    }
    expect(lost).toEqual([]);
  });
});
