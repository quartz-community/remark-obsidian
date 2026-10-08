import type {
  AlignType,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableCell,
  TableRow,
  Text,
} from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { delimits } from "./table-pipe-style.js";
import { span } from "./normalize-points.js";

/**
 * A delimiter row, with the dashes optional.
 *
 * GFM needs at least one `-` in every cell, so `|a|` over `|::|` builds nothing.
 * Obsidian builds a centred table, and the arbiter agrees -- `remark-parse@8` makes a
 * table of `|::|` and of `|:|` alike, so the dash was never required and the colons
 * carry the alignment on their own.
 */
const DELIMITER =
  /^ {0,3}\|?[ \t]*(?:-+:?|:-+:?|:+)[ \t]*(\|[ \t]*(?:-+:?|:-+:?|:+)[ \t]*)*(?:\|[ \t]*)?$/u;

/** A cell GFM refuses outright: colons with no dash at all. */
const DASHLESS = /^:+$/u;

/** Split a row into cells, with or without the outer pipes. */
function cells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

/**
 * The same split as `cells`, carrying where each one sits in the document.
 *
 * A row and its cells are nodes a consumer edits by, so they need spans, and the
 * reparsed contents need shifting onto the document rather than keeping the offsets
 * they came back with -- a fragment-relative position is worse than none, because it
 * still looks usable.
 */
function cellSpans(
  line: string,
  lineStart: number,
): Array<{ text: string; from: number; to: number }> {
  let body = line.trim();
  let base = lineStart + (line.length - line.trimStart().length);
  if (body.startsWith("|")) {
    body = body.slice(1);
    base += 1;
  }
  if (body.endsWith("|")) body = body.slice(0, -1);

  const found: Array<{ text: string; from: number; to: number }> = [];
  let at = 0;
  for (const piece of body.split("|")) {
    const lead = piece.length - piece.trimStart().length;
    const text = piece.trim();
    const from = base + at + lead;
    found.push({ text, from, to: from + text.length });
    at += piece.length + 1;
  }
  return found;
}

function alignOf(cell: string): AlignType {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (left) return "left";
  if (right) return "right";
  return null;
}

/**
 * A delimiter row shorter than its header still makes a table.
 *
 * GFM requires the two to have the same number of cells and builds nothing
 * when they differ, so `| a | b |` over `| --- |` is a paragraph. Obsidian
 * builds a table of the delimiter's width and drops the surplus header cells,
 * rendering just `a`.
 *
 * There is no tokenizer to port: measured directly, `remark-parse@8` renders
 * both cells, so it agrees with neither. The rule comes from recorded output,
 * like the body-row pipe rule next to it.
 *
 * Only a mismatch is handled. Equal counts already build a table upstream, so
 * a paragraph still holding one means something else declined it and guessing
 * there would be wrong.
 */
export function tableShortDelimiterTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const paragraph = parent.children[index];
      if (paragraph?.type !== "paragraph") continue;

      const start = paragraph.position?.start?.offset;
      const end = paragraph.position?.end?.offset;
      const startLine = paragraph.position?.start?.line;
      if (start === undefined || end === undefined) continue;
      if (startLine === undefined) continue;

      const lines = source.slice(start, end).split("\n");
      const header = lines[0];
      const delimiter = lines[1];
      if (header === undefined || delimiter === undefined) continue;
      if (!header.includes("|") || !DELIMITER.test(delimiter)) continue;
      // The promotion obeys the same precondition as every other rule here: a row
      // whose only pipe is the leading one delimits nothing. Recorded both ways --
      // `| a | b |` over `| --- |` is a table rendering `a`, and over `| --- ` it is
      // a paragraph. GFM declines both, so only the first needed promoting.
      if (!delimits(header) || !delimits(delimiter)) continue;

      const headerCells = cells(header);
      const delimiterCells = cells(delimiter);
      // Equal counts usually mean upstream already built the table, and a paragraph
      // still holding one would then be declined for a reason this pass cannot see.
      // A dashless cell is the exception, because it names that reason: GFM requires
      // a dash and refuses the row outright, so `|a|` over `|::|` reaches here with
      // matching widths and no table. `alignOf` already reads the colons.
      const dashless = delimiterCells.some((cell) => DASHLESS.test(cell));
      if (headerCells.length === delimiterCells.length && !dashless) continue;
      if (delimiterCells.length === 0) continue;

      // Every header cell is kept in the tree, but the delimiter is what
      // declares the columns, so `align` follows it rather than the header.
      // A real Reading View renders `| a | b |` over `| --- |` as `a` alone,
      // measured against the application rather than the detached renderer
      // the recorder batches -- both agree here.
      //
      // The surplus cell is therefore dropped when rendering, not when
      // parsing: `align` being short is what truncates the projection, while
      // the cell stays in the tree so a rewrite can still restore it.
      const row = (line: string, lineStart: number): TableRow =>
        span<TableRow>(
          {
            type: "tableRow",
            children: cellSpans(line, lineStart).map(
              ({ text, from, to }): TableCell => {
                const parsed = reparse(text).children[0];
                let children: PhrasingContent[];
                if (parsed?.type === "paragraph") {
                  children = parsed.children;
                  // Reparsed on its own, so numbered from the cell until shifted.
                  for (const child of children) shift(child, from, startLine);
                } else {
                  children = [
                    span<Text>(
                      { type: "text", value: text } as Text,
                      source,
                      from,
                      to,
                    ),
                  ];
                }
                return span<TableCell>(
                  { type: "tableCell", children } as TableCell,
                  source,
                  from,
                  to,
                );
              },
            ),
          } as TableRow,
          source,
          lineStart,
          lineStart + line.length,
        );

      // Body rows follow the delimiter for as long as the lines keep delimiting.
      // `|a|` over `|---|---|` over `|b|c|` is one table to Obsidian, where
      // building the header alone left `|b|c|` behind as a paragraph. The same
      // `delimits` precondition decides it, so a row whose only pipe is the
      // leading one still ends the table rather than joining it.
      let bodyEnd = start + header.length + 1 + delimiter.length;
      const body: TableRow[] = [];
      for (let at = 2; at < lines.length; at++) {
        const line = lines[at]!;
        if (!line.includes("|") || !delimits(line)) break;
        body.push(row(line, bodyEnd + 1));
        bodyEnd += 1 + line.length;
      }

      const lastLine = startLine + 1 + body.length;
      const table: Table = {
        type: "table",
        align: delimiterCells.map((cell) => alignOf(cell)),
        children: [row(header, start), ...body],
        position: {
          start: { ...paragraph.position!.start },
          end: {
            line: lastLine,
            column: (lines[1 + body.length]?.length ?? delimiter.length) + 1,
            offset: bodyEnd,
          },
        },
      };

      // Bounded by the paragraph, not the document: re-parsing to the end
      // would duplicate every block after it, since only the paragraph is
      // spliced out.
      const rest = source.slice(bodyEnd, end);
      const tail = reparse(rest.replace(/^\n/u, ""));
      const tailStart = bodyEnd + 1;
      for (const child of tail.children) shift(child, tailStart, lastLine);

      parent.children.splice(
        index,
        1,
        table,
        ...(tail.children as RootContent[]),
      );
      index += tail.children.length;
    }
  });
}

interface Point {
  line: number;
  column: number;
  offset?: number;
}

function shift(node: unknown, offset: number, line: number): void {
  const candidate = node as {
    position?: { start: Point; end: Point };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.offset = offset + (point.offset ?? 0);
      point.line += line;
    }
  }
  for (const child of candidate.children ?? []) shift(child, offset, line);
}
