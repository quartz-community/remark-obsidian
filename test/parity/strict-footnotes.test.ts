/**
 * `strict` against Obsidian's own footnote answers.
 *
 * Footnotes are in neither CommonMark nor GFM's spec, so `strict.test.ts` -- which measures
 * `strict` against stock `remark-parse` + `remark-gfm` over the published spec examples -- has
 * nothing to say about them. `strict` follows Obsidian there instead, and this is the gate that
 * says whether it does: every probe of every footnote rule, asked of the live app through
 * `ask.mts` and pinned in `goldens/strict-footnotes.json`.
 *
 * Asserted EXACTLY in both directions, like `strict.test.ts`: a probe that stops agreeing fails,
 * and so does an exclusion that starts to, so a recorded decision cannot silently change.
 *
 * The answers come from Obsidian 1.15.0 while the main goldens pin 1.14.5. Both releases are
 * recorded as moving nothing in the main corpus, and `legacy` -- the parser Obsidian forks --
 * reproduced all 107 answers when they were taken.
 */
import fs from "node:fs";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";

import remarkObsidian from "../../src/index.js";

interface Probe {
  readonly name: string;
  readonly markdown: string;
  readonly defs: readonly string[];
  readonly refs: readonly string[];
  readonly excluded?: string;
}

const golden = JSON.parse(
  fs.readFileSync(
    new URL("goldens/strict-footnotes.json", import.meta.url),
    "utf8",
  ),
) as { readonly cases: readonly Probe[] };

const strict = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkObsidian, { preset: "strict" });

/** Facts in the golden's terms: 0-based, and only references to a defined label. */
function facts(markdown: string): { defs: string[]; refs: string[] } {
  const tree = strict.runSync(strict.parse(markdown), markdown);
  const defs: string[] = [];
  const defined = new Set<string>();
  const refs: Array<[string, string]> = [];
  visit(tree, (node) => {
    const { position } = node;
    if (!position) return;
    const label = (node as { label?: string }).label ?? "";
    const at = `${String(position.start.line - 1)}:${String(position.start.column - 1)}`;
    if (node.type === "footnoteDefinition") {
      defined.add(label.toLowerCase());
      defs.push(`${label}@${at}-${String(position.end.line - 1)}`);
    } else if (node.type === "footnoteReference") {
      refs.push([label.toLowerCase(), `${label}@${at}`]);
    }
  });
  return {
    defs: defs.sort(),
    refs: refs
      .filter(([name]) => defined.has(name))
      .map(([, ref]) => ref)
      .sort(),
  };
}

const lower = (rows: readonly string[]) => rows.map((row) => row.toLowerCase());

describe("strict footnotes against Obsidian", () => {
  it("records every probe", () => {
    expect(golden.cases.length).toBe(107);
  });

  it("reads every probe the way Obsidian does", () => {
    const disagree = golden.cases
      .filter((probe) => probe.excluded === undefined)
      .filter((probe) => {
        const ours = facts(probe.markdown);
        return (
          JSON.stringify(lower(ours.defs)) !==
            JSON.stringify(lower(probe.defs)) ||
          JSON.stringify(lower(ours.refs)) !== JSON.stringify(lower(probe.refs))
        );
      })
      .map((probe) => probe.name);
    expect(disagree).toEqual([]);
  });

  it("still departs from Obsidian on every recorded exclusion", () => {
    const agree = golden.cases
      .filter((probe) => probe.excluded !== undefined)
      .filter((probe) => {
        const ours = facts(probe.markdown);
        return (
          JSON.stringify(lower(ours.defs)) ===
            JSON.stringify(lower(probe.defs)) &&
          JSON.stringify(lower(ours.refs)) === JSON.stringify(lower(probe.refs))
        );
      })
      .map((probe) => probe.name);
    expect(agree, "these now agree -- drop their exclusion").toEqual([]);
  });
});
