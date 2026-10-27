/**
 * Record the FULL positions of every referee fact: `referee-spans.json`.
 *
 * The vendored answers store a definition as `[name, line, column, lastLine]` and a reference
 * as `[name, line, column]`; the live cache reports both ends of each, with offsets. This asks
 * it again for every document and keeps the rest, in a file BESIDE the vendored answers rather
 * than in them -- those are a sibling project's data, re-synced from it, and a new format would
 * turn every re-sync into a merge.
 *
 * The vendored answers stay the authority. They are the CORRECTED recording (see AGENTS.md:
 * the augmentation that makes references readable is gated, and a naive re-recording comes
 * back short), so a span is kept only for a fact the fresh recording reproduces EXACTLY --
 * same name, same line and column, and for a definition the same last line. A fact it does not
 * reproduce gets `null`, and is reported, never guessed.
 *
 * Three more things come out of the same recording:
 *
 * - `artifacts`: vendored references sitting on a line that holds no text, or past the end of
 *   the document. No reference can sit there; they come from the augmentation, whose appended
 *   definitions an unclosed comment can swallow, so the cache reports them as references. The
 *   fresh recording drops any it makes the same way, and these are the vendored ones it does
 *   not reproduce.
 * - `inline`: Obsidian's `[inline<n>` definitions for `^[ … ]`, which the vendored answers
 *   never recorded.
 *
 * Needs Obsidian running with a vault open and the parity-probe plugin, like `ask.mts`.
 *
 *     node --import tsx --conditions=development test/parity/record-referee-spans.mts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REFEREE_ANSWERS } from "./classify.js";
import { askFull, type Placed, type Span } from "./probe-channel.js";

const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "referee-spans.json",
);
const BATCH = 500;
const VERSION = process.env.OBSIDIAN_VERSION ?? "1.15.0";

/** `[line, column, offset, endLine, endColumn, endOffset]`, zero-based, as the cache counts. */
type Compact = [number, number, number, number, number, number];

interface Row {
  readonly id: string;
  readonly text: string;
  readonly defs: ReadonlyArray<readonly [string, number, number, number]>;
  readonly refs: ReadonlyArray<readonly [string, number, number]>;
}

export interface DocumentSpans {
  defs?: Array<Compact | null>;
  refs?: Array<Compact | null>;
  artifacts?: number[];
  inline?: Array<[string, ...Compact]>;
}

const compact = (span: Span): Compact => [
  span.start.line,
  span.start.col,
  span.start.offset,
  span.end.line,
  span.end.col,
  span.end.offset,
];

const rows: Row[] = [];
for (const file of fs.readdirSync(REFEREE_ANSWERS).sort()) {
  if (!file.endsWith(".json")) continue;
  rows.push(
    ...(JSON.parse(
      fs.readFileSync(path.join(REFEREE_ANSWERS, file), "utf8"),
    ) as Row[]),
  );
}

const documents: Record<string, DocumentSpans> = {};
const tally = {
  defs: 0,
  defsPlaced: 0,
  refs: 0,
  refsPlaced: 0,
  artifacts: 0,
  freshArtifacts: 0,
  inline: 0,
  untrusted: 0,
};
const unplaced: string[] = [];

for (let at = 0; at < rows.length; at += BATCH) {
  const batch = rows.slice(at, at + BATCH);
  const answers = await askFull(batch.map((row) => row.text));
  batch.forEach((row, index) => {
    const answer = answers[index]!;
    const lines = row.text.split(/\r\n|\r|\n/u);
    const blank = (line: number) => (lines[line] ?? "").trim() === "";
    if (!answer.refsTrustworthy) tally.untrusted++;

    const footnotes = (answer.plain.footnotes ?? []).flatMap((entry) =>
      entry.id === undefined || !entry.position
        ? []
        : [{ id: entry.id, position: entry.position } as Placed],
    );
    const fresh = {
      defs: footnotes.filter((entry) => !entry.id.startsWith("[inline")),
      refs: answer.refs.filter((entry) => {
        const keep = !blank(entry.position.start.line);
        if (!keep) tally.freshArtifacts++;
        return keep;
      }),
    };

    // One fresh fact per vendored one, in order, never reused.
    const take = (
      pool: Placed[],
      name: string,
      line: number,
      column: number,
      lastLine?: number,
    ): Compact | null => {
      const hit = pool.findIndex(
        (entry) =>
          entry.id.toLowerCase() === name.toLowerCase() &&
          entry.position.start.line === line &&
          entry.position.start.col === column &&
          (lastLine === undefined || entry.position.end.line === lastLine),
      );
      if (hit === -1) return null;
      return compact(pool.splice(hit, 1)[0]!.position);
    };

    const spans: DocumentSpans = {};
    const defs = row.defs.map(([name, line, column, lastLine]) => {
      tally.defs++;
      const span = take(fresh.defs, name, line, column, lastLine);
      if (span) tally.defsPlaced++;
      else unplaced.push(`${row.id} def ${name}@${line}:${column}`);
      return span;
    });
    const artifacts: number[] = [];
    const refs = row.refs.map(([name, line, column], refIndex) => {
      tally.refs++;
      const span = take(fresh.refs, name, line, column);
      if (span) tally.refsPlaced++;
      else if (blank(line)) {
        artifacts.push(refIndex);
        tally.artifacts++;
      } else unplaced.push(`${row.id} ref ${name}@${line}:${column}`);
      return span;
    });
    const inline = footnotes
      .filter((entry) => entry.id.startsWith("[inline"))
      .map((entry): [string, ...Compact] => [
        entry.id,
        ...compact(entry.position),
      ]);
    tally.inline += inline.length;

    if (defs.length > 0) spans.defs = defs;
    if (refs.length > 0) spans.refs = refs;
    if (artifacts.length > 0) spans.artifacts = artifacts;
    if (inline.length > 0) spans.inline = inline;
    documents[row.id] = spans;
  });
}

fs.writeFileSync(
  OUT,
  `${JSON.stringify({
    obsidian: VERSION,
    recordedAt: new Date().toISOString().slice(0, 10),
    source:
      "test/parity/record-referee-spans.mts (probe-channel askFull: metadataCache.computeMetadataAsync)",
    note: "Full positions for the vendored referee answers, aligned with each row's `defs` and `refs`: [line, column, offset, endLine, endColumn, endOffset], zero-based. null where this recording did not reproduce the vendored fact exactly; `artifacts` are vendored references on lines holding no text; `inline` is Obsidian's [inline<n> definitions, which the vendored answers never recorded.",
    documents,
  })}\n`,
);

console.log(`recorded ${rows.length} documents into ${OUT}`);
console.log(
  `  definitions placed ${tally.defsPlaced}/${tally.defs}, references placed ${tally.refsPlaced}/${tally.refs}`,
);
console.log(
  `  artifacts: ${tally.artifacts} vendored references on lines holding no text; ${tally.freshArtifacts} more made by this recording's augmentation, dropped`,
);
console.log(`  inline footnotes: ${tally.inline}`);
console.log(`  augmentation untrusted on the first pass: ${tally.untrusted}`);
if (unplaced.length > 0) {
  console.log(`  NOT REPRODUCED (${unplaced.length}):`);
  for (const line of unplaced.slice(0, 60)) console.log(`    ${line}`);
  if (unplaced.length > 60)
    console.log(`    ...and ${unplaced.length - 60} more`);
}
