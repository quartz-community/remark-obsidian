/**
 * `strict` against Obsidian's own answers for its own syntax.
 *
 * Under the rule settled for 2.0, Obsidian syntax follows Obsidian even inside a CommonMark
 * construct -- a `%%` comment opener on a lazy line of a quote, a callout's title line, the
 * whitespace that makes a line an opener -- while everything else follows the spec, which
 * `strict.test.ts` measures. This is the gate for the first half: probes of each rule area,
 * asked of the live app through `ask.mts` and pinned in `goldens/strict-syntax.json`.
 *
 * Compared through `computeOurs`, the harness's mirror of `computeMetadataAsync`, on LINES only:
 * `strict` makes no promise about columns. Exact in both directions, like the other strict gates.
 */
import fs from "node:fs";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import type { Root } from "mdast";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import remarkObsidian from "../../src/index.js";
import { computeOurs } from "./normalize.js";

type Facts = Readonly<Record<string, readonly string[]>>;

interface Probe {
  readonly area: string;
  readonly name: string;
  readonly markdown: string;
  readonly obsidian: Facts;
  readonly excluded?: string;
}

const golden = JSON.parse(
  fs.readFileSync(
    new URL("goldens/strict-syntax.json", import.meta.url),
    "utf8",
  ),
) as { readonly cases: readonly Probe[] };

const strict = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkObsidian, { preset: "strict" });

/** `name@line:col-line:col` and `name@line:col` down to lines, as the golden stores them. */
const lines = (rows: readonly string[] = []): string[] =>
  rows
    .map((row) =>
      row
        .replace(/@(\d+):\d+-(\d+):\d+$/u, "@$1-$2")
        .replace(/@(\d+):\d+$/u, "@$1")
        .replace(/^[^=]*=>([^|]*)\|[^@]*@/u, "$1@"),
    )
    .sort();

function facts(markdown: string): Facts {
  const tree = strict.runSync(strict.parse(markdown), markdown);
  const computed = computeOurs(tree as Root, markdown) as unknown as Record<
    string,
    readonly string[] | undefined
  >;
  return Object.fromEntries(
    [
      "sections",
      "footnotes",
      "footnoteRefs",
      "links",
      "embeds",
      "tags",
      "headings",
      "blocks",
    ].map((key) => [key, lines(computed[key])]),
  );
}

const disagreeing = (probe: Probe): string[] => {
  const ours = facts(probe.markdown);
  return Object.keys(probe.obsidian).filter(
    (key) =>
      JSON.stringify(ours[key] ?? []) !== JSON.stringify(probe.obsidian[key]),
  );
};

describe("strict Obsidian syntax against Obsidian", () => {
  it("records every probe", () => {
    expect(golden.cases.length).toBe(282);
  });

  it("reads every probe the way Obsidian does", () => {
    const failing = golden.cases
      .filter((probe) => probe.excluded === undefined)
      .map((probe) => ({ probe, keys: disagreeing(probe) }))
      .filter(({ keys }) => keys.length > 0)
      .map(
        ({ probe, keys }) =>
          `${probe.area}: ${probe.name} (${keys.join(", ")})`,
      );
    expect(failing).toEqual([]);
  });

  it("still departs from Obsidian on every recorded exclusion", () => {
    const agreeing = golden.cases
      .filter((probe) => probe.excluded !== undefined)
      .filter((probe) => disagreeing(probe).length === 0)
      .map((probe) => probe.name);
    expect(agreeing, "these now agree -- drop their exclusion").toEqual([]);
  });
});
