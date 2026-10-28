import fs from "node:fs";

import type { GoldenCase } from "../types.js";
import {
  disagreement,
  ourFacts,
  sampleCharacters,
  TEMPLATES,
} from "./charclass.js";
import { recordBatch } from "./record.js";

/**
 * Put each sampled character into every template, record what Obsidian makes of it, and report
 * where either preset reads it otherwise. Needs Obsidian, like `sweep.ts`, and runs nightly.
 *
 *   nix develop -c npx tsx --conditions=development test/parity/fuzz/charclass-sweep.ts <seed> \
 *     [--save test/parity/goldens/charclass.json]
 *
 * The seed picks the random part of the sample; the fixed part (ASCII, whitespace, the
 * punctuation-block boundaries) is in every run. Output groups by template and preset, listing
 * the code points that disagree and one example each. Exits 1 when anything disagreed.
 */
const args = process.argv.slice(2);
/** `--save <file>`: also write the recorded answers, as `goldens/charclass.json` is made. */
const saveAt = args.indexOf("--save");
const savePath = saveAt === -1 ? undefined : args.splice(saveAt, 2)[1];
const seed = Number(args[0] ?? "0");
if (!Number.isInteger(seed)) {
  process.stderr.write("usage: charclass-sweep <seed>\n");
  process.exit(2);
}

const characters = sampleCharacters(seed);
const point = (c: string) =>
  [...c]
    .map(
      (u) =>
        `U+${u.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`,
    )
    .join(" ");

const entries = TEMPLATES.flatMap((template) =>
  characters.map((c) => ({
    id: `charclass/${template.name}/${point(c).replace(/\W+/gu, "-")}`,
    markdown: template.build(c),
    template,
    c,
  })),
);
process.stderr.write(
  `recording ${entries.length} documents: ${characters.length} characters x ${TEMPLATES.length} templates\n`,
);
const { cases } = recordBatch(
  entries.map(({ id, markdown }) => ({ id, markdown })),
);

if (savePath) {
  const answers = entries.flatMap((entry) => {
    const compute = (cases[entry.id] as GoldenCase | undefined)?.obsidian
      .compute;
    if (!compute) return [];
    return [
      {
        template: entry.template.name,
        c: entry.c,
        obsidian: Object.fromEntries(
          entry.template.keys.map((key) => [key, compute[key] ?? []]),
        ),
      },
    ];
  });
  fs.writeFileSync(
    savePath,
    `${JSON.stringify({ seed, recordedAt: new Date().toISOString(), answers }, null, 1)}\n`,
  );
}

const groups = new Map<string, Array<{ c: string; diff: string[] }>>();
let unrecorded = 0;
for (const entry of entries) {
  const golden = cases[entry.id] as GoldenCase | undefined;
  const obsidian = golden?.obsidian.compute;
  if (!obsidian) {
    unrecorded++;
    continue;
  }
  for (const preset of ["legacy", "strict"] as const) {
    const diff = disagreement(
      entry.template,
      obsidian,
      ourFacts(entry.markdown, preset),
      preset,
    );
    if (diff.length === 0) continue;
    const key = `${entry.template.name} [${preset}]`;
    const group = groups.get(key) ?? [];
    group.push({ c: entry.c, diff });
    groups.set(key, group);
  }
}

const lines: string[] = [];
lines.push(
  `charclass: seed ${seed}, ${characters.length} characters x ${TEMPLATES.length} templates` +
    (unrecorded ? `, ${unrecorded} not recorded` : ""),
);
if (groups.size === 0)
  lines.push("every character reads as Obsidian reads it, under both presets");
for (const [key, group] of [...groups].sort(
  (a, b) => b[1].length - a[1].length,
)) {
  lines.push(`\n${key}: ${group.length} characters`);
  lines.push(
    `  ${group.map(({ c }) => `${point(c)} ${JSON.stringify(c)}`).join(", ")}`,
  );
  const first = group[0]!;
  lines.push(`  e.g. ${point(first.c)}: ${first.diff.join("; ")}`);
}
process.stdout.write(`${lines.join("\n")}\n`);
// Queued writes, and no exit: a pipe can lose what process.exit discards (AGENTS.md).
process.exitCode = groups.size === 0 ? 0 : 1;
