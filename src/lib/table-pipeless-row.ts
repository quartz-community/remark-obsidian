import type { Root, RootContent, Table, TableRow } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

const INDENTED = /^(?: {4,}|\t)/u;
const PAD = /^[ \t]+/u;

interface ParentNode extends Node {
  children: RootContent[];
}

/**
 * An indented pipe row still belongs to a PIPELESS table (rule C2).
 *
 * C1 makes the header and delimiter rows agree on whether a row's first character
 * is a pipe. C2 extends that to the body, and its worked example is the case this
 * pass exists for: in a table whose header does NOT start with a pipe, a row
 * "does not start with a pipe" either, so an indented `| c[^2] | d` is still a
 * row. We read it as indented code instead, and a reference inside code is never
 * scanned -- so the reference is lost with the row.
 *
 * Measured from the tree rather than from a line scan, which matters here. A
 * regex for "an indented line holding a pipe and a `[^x]`" fires on 114 positions
 * and splits 15 gain / 20 break, because it also matches definition labels whose
 * pipe comes from a wikilink alias. Keyed on a real `table` node with a pipeless
 * header it fires on 8 and scores 5 gain / 0 break.
 *
 * All five gains have the line covered by a `code` leaf -- twice `root > code`,
 * three times `root > list > listItem > code` -- so one sibling-level repair
 * reaches every host, and the differing hosts are not differing mechanisms.
 *
 * The row is built by re-parsing the table's own first two lines with the
 * de-indented row appended, then moving the resulting last row onto the real
 * line. Re-parsing the whole table slice would not work for a quoted table: the
 * node starts after the `>`, so the slice's later lines keep a `>` the reparse
 * then refuses to read as rows.
 */
export function tablePipelessRowTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  const lines = source.split("\n");

  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length - 1; index++) {
      const table = parent.children[index];
      const code = parent.children[index + 1];
      if (table?.type !== "table" || code?.type !== "code") continue;

      const row = absorb(table, code, lines, source, reparse);
      if (!row) continue;

      table.children.push(row);
      if (table.position && row.position)
        table.position.end = { ...row.position.end };
      parent.children.splice(index + 1, 1);
    }
  });
}

function absorb(
  table: Table,
  code: RootContent,
  lines: string[],
  source: string,
  reparse: (markdown: string) => Root,
): TableRow | undefined {
  const start = table.position?.start.line;
  const end = table.position?.end.line;
  const codeStart = code.position?.start.line;
  if (start === undefined || end === undefined || codeStart === undefined)
    return undefined;
  if (codeStart !== end + 1) return undefined;

  const header = lines[start - 1];
  const delimiter = lines[start];
  const raw = lines[codeStart - 1];
  if (header === undefined || delimiter === undefined || raw === undefined)
    return undefined;

  if (header.trimStart().startsWith("|")) return undefined;
  if (header.startsWith(">") || delimiter.trimStart().startsWith(">"))
    return undefined;
  if (!INDENTED.test(raw)) return undefined;

  const pad = PAD.exec(raw)?.[0].length ?? 0;
  const body = raw.slice(pad);
  if (!body.startsWith("|")) return undefined;

  const parsed = reparse(`${header}\n${delimiter}\n${body}`);
  const rebuilt = parsed.children[0];
  if (rebuilt?.type !== "table") return undefined;

  const last = rebuilt.children.at(-1);
  if (!last || rebuilt.children.length < 2) return undefined;

  const anchor = last.position?.start.offset;
  const base = offsetOfLine(source, codeStart - 1);
  if (anchor === undefined || base === undefined) return undefined;

  move(last, codeStart, base + pad - anchor, pad);
  return last;
}

function offsetOfLine(source: string, line: number): number | undefined {
  let offset = 0;
  for (let index = 0; index < line; index++) {
    const next = source.indexOf("\n", offset);
    if (next === -1) return undefined;
    offset = next + 1;
  }
  return offset;
}

function move(node: unknown, line: number, delta: number, pad: number): void {
  const candidate = node as {
    position?: {
      start: { line: number; column: number; offset?: number };
      end: { line: number; column: number; offset?: number };
    };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.line = line;
      point.column += pad;
      if (point.offset !== undefined) point.offset += delta;
    }
  }
  for (const child of candidate.children ?? []) move(child, line, delta, pad);
}
