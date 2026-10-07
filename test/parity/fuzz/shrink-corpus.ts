import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { shrinkAll } from "./shrink.js";
import type { GoldenCase } from "../types.js";

/**
 * Shrink the corpus's own unattributable cases.
 *
 * `sweep.ts` shrinks what a fresh seed range produced. This does the same job for
 * documents already recorded here, which is what the backlog actually needs: a fuzz
 * document carrying six constructs is not evidence about any one of them, and
 * generating more of them does not help. Reducing the ones already present does.
 *
 *   npx tsx --conditions=development test/parity/fuzz/shrink-corpus.ts [maxConstructs]
 *
 * Needs Obsidian, like any recording.
 */
const CONSTRUCTS: RegExp[] = [
  /\[\[/,
  /!\[\[/,
  /\^\[/,
  /\[\^/,
  /%%/,
  /==/,
  /\$/,
  /~~/,
  /\|/,
  /^\s*>/m,
  /^\s*#{1,6}\s/m,
  /^\s*[-*+]\s/m,
  /^\s*\d+[.)]\s/m,
  /^\s*(=+|-+)\s*$/m,
  /<\/?[a-zA-Z]/,
  /`/,
  /\^[a-z0-9-]+\s*$/m,
  /\\[!-/:-@[-`{-~]/,
  /\t/,
];

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenPath = path.join(here, "..", "goldens", "obsidian.json");
const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8")) as {
  cases: Record<string, GoldenCase>;
};

const limit = Number(process.argv[2] ?? "2");
const targets = new Map<string, string>();
for (const [id, entry] of Object.entries(golden.cases)) {
  if (entry.triage !== "replicate") continue;
  if (id.startsWith("probe/") || id.startsWith("commonmark/")) continue;
  const density = CONSTRUCTS.filter((pattern) =>
    pattern.test(entry.markdown),
  ).length;
  if (density <= limit) continue;
  targets.set(id, entry.markdown);
}

process.stderr.write(
  `shrinking ${targets.size} cases carrying more than ${limit} constructs\n`,
);
const minimal = shrinkAll(targets);

const byForm = new Map<string, string[]>();
for (const [id, markdown] of minimal) {
  const seen = byForm.get(markdown) ?? [];
  seen.push(id);
  byForm.set(markdown, seen);
}

console.log(
  `\nshrink-corpus: ${targets.size} cases reduce to ${byForm.size} distinct forms\n`,
);
for (const [markdown, ids] of [...byForm].sort(
  (a, b) => b[1].length - a[1].length,
)) {
  const also = ids.length > 1 ? `  (${ids.length} cases)` : "";
  console.log(`  ${JSON.stringify(markdown)}${also}`);
  console.log(`      from ${ids[0]}, ${markdown.length} chars`);
}
