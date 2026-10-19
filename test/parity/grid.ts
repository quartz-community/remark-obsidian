/**
 * The probe GRID's library half: the axes, the field extractors, and the comparison.
 *
 * Six of the seven rules landed in one session came from a grid rather than from a shrink.
 * Shrinking finds the SHAPE a family reduces to; a grid finds the RULE and, more importantly,
 * its boundaries -- the cells that AGREE are what separate "a tab in a marker separator
 * reaches its stop" from "ordered markers behave oddly", and a single probe cannot supply them.
 *
 * It existed as about two dozen throwaway scripts, each rebuilding the same cross product,
 * channel call and X-marked table, and each deleted after use. So a grid cost a script, was
 * never re-runnable, and only the cells someone remembered to promote reached the ledger.
 * This makes a grid three lines and `--record` promotes every cell at once.
 *
 * The axes are declared here rather than taken from the CLI because a grid IS a measurement: a
 * named one can be re-run after a later change and compared against what it said before, which
 * an argv cross product cannot.
 */
import type { Answer } from "./probe-channel.js";
import { refereeFactsWithTree } from "./referee-facts.js";

export interface Grid {
  readonly name: string;
  readonly what: string;
  /** Row label and its substitution. */
  readonly rows: ReadonlyArray<readonly [string, string]>;
  /** Column label and its substitution. */
  readonly cols: ReadonlyArray<readonly [string, string]>;
  /** Builds one document. `row` and `col` are the substitutions, not the labels. */
  readonly document: (row: string, col: string) => string;
  /** Which answer to compare. Named rather than a callback so a grid stays declarative. */
  readonly field: FieldName;
}

export type FieldName =
  | "def.exists"
  | "def.col"
  | "def.end"
  | "code.exists"
  | "code.second-line"
  | "refs.count";

/**
 * One cell's value from one side's answer.
 *
 * `-1` is "absent" throughout rather than `undefined`, so a missing definition and a definition
 * at column 0 cannot be confused in a printed table -- the mistake that made an earlier probe
 * read `[]` as "Obsidian indexes nothing" when it meant "the key was not there".
 */
export function cellOf(field: FieldName, answer: Facts): number {
  const def = answer.defs[0];
  switch (field) {
    case "def.exists":
      return answer.defs.length > 0 ? 1 : -1;
    case "def.col":
      return def ? def[2] : -1;
    case "def.end":
      return def ? def[3] : -1;
    case "code.exists":
      return (answer.code ?? []).length > 0 ? 1 : -1;
    case "code.second-line":
      return (answer.code ?? []).some((range) => range[0] === 1) ? 1 : -1;
    case "refs.count":
      return answer.refs.length;
  }
}

export interface Facts {
  readonly defs: ReadonlyArray<readonly [string, number, number, number]>;
  readonly refs: ReadonlyArray<readonly [string, number, number]>;
  readonly code?: ReadonlyArray<readonly [number, number]>;
}

/** Our side, in the same shape the channel returns, so one extractor serves both. */
export function oursFor(text: string): Facts {
  const got = refereeFactsWithTree(text);
  const code: [number, number][] = [];
  for (const child of got.tree.children) {
    if (child.type === "code" && child.position) {
      code.push([child.position.start.line - 1, child.position.end.line - 1]);
    }
  }
  return { defs: got.defs, refs: got.refs, code };
}

export interface Cell {
  readonly row: string;
  readonly col: string;
  readonly text: string;
  readonly theirs: number;
  readonly ours: number;
}

/** Every cell of a grid, given the channel's answers in row-major order. */
export function cellsOf(grid: Grid, answers: readonly Answer[]): Cell[] {
  const out: Cell[] = [];
  let at = 0;
  for (const [rowName, row] of grid.rows) {
    for (const [colName, col] of grid.cols) {
      const text = grid.document(row, col);
      const theirs = answers[at];
      out.push({
        row: rowName,
        col: colName,
        text,
        theirs: theirs ? cellOf(grid.field, theirs) : -1,
        ours: cellOf(grid.field, oursFor(text)),
      });
      at++;
    }
  }
  return out;
}

/** Row-major, which `cellsOf` relies on. */
export function documentsOf(grid: Grid): string[] {
  const out: string[] = [];
  for (const [, row] of grid.rows) {
    for (const [, col] of grid.cols) out.push(grid.document(row, col));
  }
  return out;
}

/**
 * The X-marked table, printed the way every hand-built grid printed it.
 *
 * A cell is its value when the sides agree and `Xtheirs/ours` when they do not, because the
 * DIRECTION is what names the rule -- "we invent" and "we miss" are different families, and a
 * bare divergence count cannot tell them apart.
 */
export function render(grid: Grid, cells: readonly Cell[]): string {
  const width = Math.max(9, ...grid.cols.map(([name]) => name.length + 2));
  const lines: string[] = [];
  lines.push(`  ${grid.name} -- ${grid.what}`);
  lines.push(`  field: ${grid.field}   (-1 = absent)`);
  lines.push("");
  const label = Math.max(...grid.rows.map(([name]) => name.length)) + 2;
  lines.push(
    " ".repeat(label + 2) +
      grid.cols.map(([name]) => name.padStart(width)).join(""),
  );
  for (const [rowName] of grid.rows) {
    const mine = cells.filter((cell) => cell.row === rowName);
    const body = grid.cols
      .map(([colName]) => {
        const cell = mine.find((c) => c.col === colName)!;
        const same = cell.theirs === cell.ours;
        return (
          same ? String(cell.theirs) : `X${cell.theirs}/${cell.ours}`
        ).padStart(width);
      })
      .join("");
    lines.push(`  ${rowName.padEnd(label)}` + body);
  }
  const bad = cells.filter((cell) => cell.theirs !== cell.ours).length;
  lines.push("");
  lines.push(`  ${bad} of ${cells.length} cells diverge`);
  return lines.join("\n");
}
