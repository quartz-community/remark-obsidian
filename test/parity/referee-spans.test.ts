/**
 * `referee-spans.json` stays aligned with the vendored referee answers.
 *
 * The file holds the full positions of every vendored fact, by row id and in the same order as
 * each row's `defs` and `refs` -- so a re-sync of the vendored answers that is not followed by
 * `record-referee-spans.mts` would leave it pointing at the wrong facts, and the referee's span
 * dimension would quietly compare fewer documents. This asserts the alignment and the recorded
 * exceptions instead, so that drift fails here rather than in a figure nobody re-reads.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { REFEREE_ANSWERS } from "./classify.js";

type Compact = readonly [number, number, number, number, number, number];
interface DocumentSpans {
  readonly defs?: ReadonlyArray<Compact | null>;
  readonly refs?: ReadonlyArray<Compact | null>;
  readonly artifacts?: readonly number[];
  readonly inline?: ReadonlyArray<readonly [string, ...Compact]>;
}
interface Row {
  readonly id: string;
  readonly text: string;
  readonly defs: ReadonlyArray<readonly [string, number, number, number]>;
  readonly refs: ReadonlyArray<readonly [string, number, number]>;
}

const rows: Row[] = fs
  .readdirSync(REFEREE_ANSWERS)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .flatMap(
    (file) =>
      JSON.parse(
        fs.readFileSync(path.join(REFEREE_ANSWERS, file), "utf8"),
      ) as Row[],
  );
const { documents } = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(REFEREE_ANSWERS), "referee-spans.json"),
    "utf8",
  ),
) as { documents: Record<string, DocumentSpans> };

describe("referee spans", () => {
  it("records every vendored document and nothing else", () => {
    expect(Object.keys(documents).sort()).toEqual(
      rows.map((row) => row.id).sort(),
    );
  });

  it("aligns with each row's definitions and references", () => {
    const misaligned = rows.filter((row) => {
      const spans = documents[row.id] ?? {};
      return (
        (spans.defs ?? []).length !== row.defs.length ||
        (spans.refs ?? []).length !== row.refs.length
      );
    });
    expect(misaligned.map((row) => row.id)).toEqual([]);
  });

  it("agrees with the tuple wherever it holds a span", () => {
    const wrong: string[] = [];
    for (const row of rows) {
      const spans = documents[row.id] ?? {};
      row.defs.forEach(([name, line, column, last], index) => {
        const span = spans.defs?.[index];
        if (
          span &&
          (span[0] !== line || span[1] !== column || span[3] !== last)
        ) {
          wrong.push(`${row.id} def ${name}`);
        }
      });
      row.refs.forEach(([name, line, column], index) => {
        const span = spans.refs?.[index];
        if (span && (span[0] !== line || span[1] !== column)) {
          wrong.push(`${row.id} ref ${name}`);
        }
      });
    }
    expect(wrong).toEqual([]);
  });

  it("marks as artifacts only references on lines holding no text", () => {
    const wrong: string[] = [];
    for (const row of rows) {
      const lines = row.text.split(/\r\n|\r|\n/u);
      for (const index of documents[row.id]?.artifacts ?? []) {
        const ref = row.refs[index];
        if (!ref || (lines[ref[1]] ?? "").trim() !== "") {
          wrong.push(`${row.id} ref #${index}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("leaves unplaced only the facts the recording could not reproduce", () => {
    // `fuzz:20261003-1239`'s vendored answer is upstream's more complete list, adopted because
    // the recording's augmentation is buried there (AGENTS.md); its two references stay unplaced.
    const unplaced: string[] = [];
    for (const row of rows) {
      const spans = documents[row.id] ?? {};
      const artifacts = new Set(spans.artifacts ?? []);
      (spans.defs ?? []).forEach((span, index) => {
        if (span === null)
          unplaced.push(`${row.id} def ${row.defs[index]![0]}`);
      });
      (spans.refs ?? []).forEach((span, index) => {
        if (span === null && !artifacts.has(index)) {
          unplaced.push(`${row.id} ref ${row.refs[index]![0]}`);
        }
      });
    }
    expect(unplaced).toEqual([
      "fuzz:20261003-1239 ref note",
      "fuzz:20261003-1239 ref b",
    ]);
  });
});
