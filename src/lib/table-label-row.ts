import type {
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

interface Point {
  line: number;
  column: number;
  offset: number;
}

const OUTER_PIPED = (line: string): boolean => line.trimStart().startsWith("|");

function pointOf(source: string, offset: number): Point {
  const before = source.slice(0, offset);
  return {
    line: before.split("\n").length,
    column: offset - before.lastIndexOf("\n"),
    offset,
  };
}

function span<T>(node: T, source: string, from: number, to: number): T {
  (node as { position: { start: Point; end: Point } }).position = {
    start: pointOf(source, from),
    end: pointOf(source, to),
  };
  return node;
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

/** The same splitting `tableShortDelimiterTransform` uses, kept local rather than shared. */
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

/**
 * In a table with no outer pipes, a footnote label line is a ROW.
 *
 * `a | b` / `--- | ---` / `[^1]: x | y` defines nothing in Obsidian: the label line is an
 * ordinary body row, so its text renders as `1: x y` and the reference below it resolves
 * against nothing. micromark's footnote construct claims the line instead and ends the
 * table one line early.
 *
 * The pipe is the axis, not the table, which is what the two controls establish:
 *
 *     | a | b |         piped, so the label line is NOT a row and DOES define --
 *     | --- | --- |     `probe/table-label/piped`, already matching
 *     [^1]: x | y
 *
 *     a | b             a blank line ends the table, so this defines too --
 *     --- | ---         `probe/table-label/pipeless-blank`, already matching
 *                       (and `hunt/label-after-pipeless-table/0` is the third control:
 *     [^1]: x | y        a label line with NO pipe defines even when adjacent)
 *
 * Restricted to a SINGLE-LINE definition, because that is the whole of the evidence. A
 * label whose body continues onto further lines is not in the corpus or in the referee's
 * answers, and a row is a one-line construct -- guessing which lines it would swallow is
 * how a repair pass invents structure nothing measures.
 *
 * Written as construction rather than a re-parse because a re-parse cannot help: the
 * footnote construct wins the line again, which is how the node being undone got here.
 */
export function tableLabelRowTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = parent.children.length - 2; index >= 0; index--) {
      const table = parent.children[index];
      const label = parent.children[index + 1];
      if (table?.type !== "table" || label?.type !== "footnoteDefinition") {
        continue;
      }

      const tableStart = table.position?.start?.offset;
      const tableEnd = table.position?.end?.offset;
      const from = label.position?.start?.offset;
      const to = label.position?.end?.offset;
      const startLine = label.position?.start?.line;
      if (tableStart === undefined || tableEnd === undefined) continue;
      if (from === undefined || to === undefined) continue;
      if (startLine === undefined) continue;

      const header = source.slice(tableStart, tableEnd).split("\n")[0];
      if (header === undefined || OUTER_PIPED(header)) continue;

      // Adjacent, so the blank-line control keeps its definition.
      if (source.slice(tableEnd, from) !== "\n") continue;

      const lineStart = source.lastIndexOf("\n", from - 1) + 1;
      const nl = source.indexOf("\n", from);
      const lineEnd = nl === -1 ? source.length : nl;
      const line = source.slice(lineStart, lineEnd);
      if (!line.includes("|")) continue;
      // One line only, as the docstring records.
      if (to > lineEnd) continue;

      const row = span<TableRow>(
        {
          type: "tableRow",
          children: cellSpans(line, lineStart).map(
            ({ text, from: cellFrom, to: cellTo }): TableCell => {
              const parsed = reparse(text).children[0];
              let children: PhrasingContent[];
              if (parsed?.type === "paragraph") {
                children = parsed.children;
                for (const child of children) {
                  shift(child, cellFrom, startLine - 1);
                }
              } else {
                children = [
                  span<Text>(
                    { type: "text", value: text } as Text,
                    source,
                    cellFrom,
                    cellTo,
                  ),
                ];
              }
              return span<TableCell>(
                { type: "tableCell", children } as TableCell,
                source,
                cellFrom,
                cellTo,
              );
            },
          ),
        } as TableRow,
        source,
        lineStart,
        lineEnd,
      );

      (table as Table).children.push(row);
      if (table.position) table.position.end = pointOf(source, lineEnd);
      parent.children.splice(index + 1, 1);
    }
  });
}
