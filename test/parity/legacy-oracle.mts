/**
 * `remark-parse@8` as a LOCAL differential oracle, at thousands of documents per second.
 *
 * This package's own README states the premise: Obsidian's inherited divergences -- emphasis,
 * lists, entities, autolinks, code spans, html blocks, link labels -- come from
 * `remark-parse@8`. The whole effort has been RE-DERIVING that parser's behaviour one rule at a
 * time by probing a live Obsidian at roughly one document per second. The parser itself installs
 * in seconds and answers in process.
 *
 * It is NOT a replacement oracle. Measured over the referee corpus:
 *
 *     definitions          OURS 6134/6818     remark-parse@8 + footnotes 5609/6818
 *     root code ranges     OURS  847/883      remark-parse@8              531/883
 *
 * So it is worse overall, which is expected -- sixty passes sit on top of micromark here for
 * exactly that reason. What makes it valuable is the ASYMMETRY:
 *
 *     definitions   rp8 right where we are wrong : 411    we right where rp8 is wrong : 936
 *     code ranges   rp8 right where we are wrong :  16    we right where rp8 is wrong : 332
 *
 * **427 documents whose correct answer is available locally**, and 60% of the remaining
 * definition gap. Spot-checked three, all genuine, and all in families this file had REFUSED
 * after classifying them exhaustively:
 *
 *     want ["ch2*",15,0,16]   ours ["ch2*",15,0,18]   def-end +2
 *     want []                 ours [["3",23,2,23]]    def-extra
 *     want ["x-y",9,3,11]     ours ["x-y",9,3,9]      def-end -2
 *
 * `def-end±N` is 213 documents that these notes classified in full and concluded "nothing in the
 * family is worth building", on the grounds that its largest slice was the refused
 * `quote-truncate` family and the tail was seven mechanisms of four to seventeen. That conclusion
 * was about deriving the rule from the DIVERGENCES. The rule exists in a parser we can install.
 *
 * HOW TO USE IT, and the discipline that matters: rp8 is a HYPOTHESIS, validated per document by
 * the recorded Obsidian answer. Where rp8 matches the answer and we do not, its tree is the
 * blueprint and the diff between the two trees is the work. Where rp8 and Obsidian disagree, rp8
 * is not the authority -- those 936 documents are the extensions and fixes this package correctly
 * adds on top, and copying rp8 there would be a regression.
 *
 *     npx tsx --conditions=development test/parity/legacy-oracle.mts            both dimensions
 *     npx tsx --conditions=development test/parity/legacy-oracle.mts --ids      ids rp8 gets right
 */
import fs from "node:fs";
import { createRequire } from "node:module";

import type { Node, Parent } from "unist";

import { refereeFactsWithTree } from "./referee-facts.js";

const require = createRequire(import.meta.url);
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
const unified9 = require("unified9");
const parse8 = require("remarkParse8");
const footnotes2 = require("remarkFootnotes2");

/** `inlineNotes` on, because Obsidian supports `^[inline]` and the referee records them. */
const legacy = (unified9.default ?? unified9)()
  .use(parse8.default ?? parse8)
  .use(footnotes2.default ?? footnotes2, { inlineNotes: true });

const parseLegacy = (text: string): Node => legacy.parse(text) as Node;
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

interface Record_ {
  readonly id?: string;
  readonly text?: string;
  readonly defs?: readonly (readonly [string, number, number, number])[];
  readonly code?: readonly (readonly [number, number])[];
}

const dir = process.env.PARITY_REFEREE_DIR;
if (dir === undefined) {
  console.error("legacy-oracle: set PARITY_REFEREE_DIR");
  process.exit(1);
}

const records: { id: string; rec: Record_ }[] = [];
for (const file of fs.readdirSync(dir).sort()) {
  if (!file.endsWith(".json")) continue;
  const parsed: unknown = JSON.parse(fs.readFileSync(`${dir}/${file}`, "utf8"));
  const rows = (Array.isArray(parsed) ? parsed : []) as Record_[];
  for (const [at, rec] of rows.entries()) {
    if (rec.text !== undefined) {
      records.push({ id: rec.id ?? `${file}#${at}`, rec });
    }
  }
}

const defsOf = (tree: Node): string => {
  const out: [string, number, number, number][] = [];
  const walk = (node: Node): void => {
    for (const child of ((node as Parent).children ?? []) as Node[]) {
      if (child.type === "footnoteDefinition" && child.position) {
        out.push([
          String(
            (child as unknown as { identifier: string }).identifier,
          ).toLowerCase(),
          child.position.start.line - 1,
          child.position.start.column - 1,
          child.position.end.line - 1,
        ]);
      }
      walk(child);
    }
  };
  walk(tree);
  return JSON.stringify(out);
};

const codeOf = (tree: Node): string => {
  const out: [number, number][] = [];
  for (const child of ((tree as Parent).children ?? []) as Node[]) {
    if (child.type === "code" && child.position) {
      out.push([child.position.start.line - 1, child.position.end.line - 1]);
    }
  }
  return JSON.stringify(out.sort());
};

const wantIds = process.argv.includes("--ids");
const blueprint: Record<string, string[]> = { defs: [], code: [] };
const tally = {
  defs: { ours: 0, rp8: 0, fixes: 0, we: 0, both: 0, n: 0 },
  code: { ours: 0, rp8: 0, fixes: 0, we: 0, both: 0, n: 0 },
};

for (const { id, rec } of records) {
  const text = rec.text!;
  let legacyTree: Node;
  try {
    legacyTree = parseLegacy(text);
  } catch {
    continue;
  }
  const mine = refereeFactsWithTree(text).tree as Node;

  for (const dim of ["defs", "code"] as const) {
    if (dim === "code" && (rec.code?.length ?? 0) === 0) continue;
    const want =
      dim === "defs"
        ? JSON.stringify(
            (rec.defs ?? []).map((d) => [d[0].toLowerCase(), d[1], d[2], d[3]]),
          )
        : JSON.stringify([...(rec.code ?? [])].sort());
    const ours = dim === "defs" ? defsOf(mine) : codeOf(mine);
    const theirs = dim === "defs" ? defsOf(legacyTree) : codeOf(legacyTree);
    const t = tally[dim];
    t.n += 1;
    if (ours === want) t.ours += 1;
    if (theirs === want) t.rp8 += 1;
    if (ours !== want && theirs === want) {
      t.fixes += 1;
      blueprint[dim]!.push(id);
    }
    if (ours === want && theirs !== want) t.we += 1;
    if (ours !== want && theirs !== want) t.both += 1;
  }
}

for (const dim of ["defs", "code"] as const) {
  const t = tally[dim];
  console.log(`\n  ${dim.toUpperCase()} over ${t.n} documents`);
  console.log(`    ours agree                  : ${t.ours}`);
  console.log(`    remark-parse@8 agrees       : ${t.rp8}`);
  console.log(
    `    rp8 RIGHT where we are wrong: ${t.fixes}   <- the blueprint`,
  );
  console.log(`    we right where rp8 is wrong : ${t.we}`);
  console.log(`    both wrong                  : ${t.both}`);
}

if (wantIds) {
  for (const dim of ["defs", "code"] as const) {
    const out = `/tmp/opencode/rp8-blueprint-${dim}.txt`;
    fs.writeFileSync(out, blueprint[dim]!.join("\n") + "\n");
    console.log(`\n  ${blueprint[dim]!.length} ids -> ${out}`);
  }
}
