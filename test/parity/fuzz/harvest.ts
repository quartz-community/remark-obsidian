import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { GoldenCase } from "../types.js";

/**
 * Turn a sweep report into corpus cases.
 *
 * A minimal form is only worth finding once. Promoting it into `SEEDS` makes
 * it a permanent regression case recorded against Obsidian like any other,
 * so the next sweep spends its seeds on new ground instead of rediscovering
 * the same twenty-character documents.
 *
 *   npx tsx --conditions=development test/parity/fuzz/harvest.ts <report> [--write]
 *
 * Without `--write` it prints what it would add, which is the safer default
 * when a sweep has produced a hundred of them.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const corpusPath = path.join(here, "..", "corpus.ts");
const goldenPath = path.join(here, "..", "goldens", "obsidian.json");

const reportPath = process.argv[2];
const write = process.argv.includes("--write");
if (!reportPath) {
  console.error("usage: harvest <report> [--write]");
  process.exit(2);
}

/** The report prints one reduced document per line, JSON-quoted. */
function formsFrom(report: string): string[] {
  const forms: string[] = [];
  for (const line of report.split("\n")) {
    const match = /^ {2}("(?:[^"\\]|\\.)*")/u.exec(line);
    if (!match) continue;
    try {
      forms.push(JSON.parse(match[1]!) as string);
    } catch {
      // A line that does not parse is prose, not a form.
    }
  }
  return forms;
}

/**
 * Name a case after the construct that dominates it, so the corpus stays
 * navigable. Order matters: the more specific constructs are tested first,
 * since a document holding `![[a|100]]` also holds `[[`.
 */
const CATEGORY: ReadonlyArray<readonly [string, RegExp]> = [
  ["block-ref", /(?:^|\s)\^[a-z0-9-]/iu],
  ["embed", /!\[\[/u],
  ["inline-footnote", /\^\[/u],
  ["footnote", /\[\^/u],
  ["callout", /\[!/u],
  ["comment", /%%/u],
  ["highlight", /==/u],
  ["table", /\|/u],
  ["math", /\$/u],
  ["wikilink", /\[\[/u],
  ["tag", /#[a-z]/iu],
  ["setext", /^(?:===|---)$/mu],
  ["html", /<[a-z]/iu],
  ["entity", /&[a-z]/iu],
  ["strikethrough", /~~/u],
  ["emphasis", /[*_]/u],
];

function categorise(markdown: string): string {
  for (const [name, pattern] of CATEGORY) {
    if (pattern.test(markdown)) return name;
  }
  return "misc";
}

const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8")) as {
  cases: Record<string, GoldenCase>;
};
const known = new Set(
  Object.values(golden.cases).map((entry) => entry.markdown),
);
const corpus = fs.readFileSync(corpusPath, "utf8");

const forms = formsFrom(fs.readFileSync(reportPath, "utf8"));
const novel = forms.filter(
  (form) => !known.has(form) && !corpus.includes(JSON.stringify(form)),
);

const counts = new Map<string, number>();
const entries = novel.map((form) => {
  const category = categorise(form);
  const next = (counts.get(category) ?? 0) + 1;
  counts.set(category, next);
  return `  [${JSON.stringify(`fuzz/${category}/${next}`)}, ${JSON.stringify(form)}],`;
});

console.log(
  `${forms.length} forms in the report, ${novel.length} not already covered`,
);
console.log(
  "by category: " +
    JSON.stringify(Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]))),
);

if (entries.length === 0) process.exit(0);

if (!write) {
  console.log("\n--- would add (pass --write to apply) ---");
  for (const entry of entries.slice(0, 40)) console.log(entry);
  if (entries.length > 40) console.log(`  ... and ${entries.length - 40} more`);
  process.exit(0);
}

const anchor = '  ["breaks/single-newline", "line one\\nline two\\n"],\n';
if (!corpus.includes(anchor)) {
  console.error("corpus anchor not found; refusing to guess where to insert");
  process.exit(1);
}
const block = [
  "",
  "  // Reduced by the fuzz shrinker from randomly composed documents, each the",
  "  // smallest input that still disagreed with Obsidian. Minimal and distinct,",
  "  // so they read as ordinary cases rather than as generated noise.",
  ...entries,
  "",
].join("\n");
fs.writeFileSync(corpusPath, corpus.replace(anchor, anchor + block), "utf8");
console.log(`\nadded ${entries.length} cases to corpus.ts`);
