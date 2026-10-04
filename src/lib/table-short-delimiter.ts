import type {
  AlignType,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableCell,
  TableRow,
} from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

const DELIMITER =
  /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/u;

/** Split a row into cells, with or without the outer pipes. */
function cells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  return trimmed.split("|").map((cell) => cell.trim());
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

      const headerCells = cells(header);
      const delimiterCells = cells(delimiter);
      if (headerCells.length === delimiterCells.length) continue;
      if (delimiterCells.length === 0) continue;

      // Every header cell is kept. The delimiter only supplies alignment, and
      // it running short does not drop a column: a real Reading View renders
      // `| a | b |` over `| --- |` as two cells. The detached renderer the
      // recorder uses drops the surplus, which is a rendering difference the
      // harness already documents for other over-long rows -- building one
      // column to match it would lose a cell a rewrite then cannot restore.
      const row = (line: string): TableRow => ({
        type: "tableRow",
        children: cells(line).map((cell): TableCell => {
          const parsed = reparse(cell).children[0];
          return {
            type: "tableCell",
            children:
              parsed?.type === "paragraph"
                ? parsed.children
                : ([{ type: "text", value: cell }] as PhrasingContent[]),
          };
        }),
      });

      const table: Table = {
        type: "table",
        align: headerCells.map((_, column) =>
          column < delimiterCells.length
            ? alignOf(delimiterCells[column]!)
            : null,
        ),
        children: [row(header)],
        position: {
          start: { ...paragraph.position!.start },
          end: {
            line: startLine + 1,
            column: delimiter.length + 1,
            offset: start + header.length + 1 + delimiter.length,
          },
        },
      };

      // Bounded by the paragraph, not the document: re-parsing to the end
      // would duplicate every block after it, since only the paragraph is
      // spliced out.
      const rest = source.slice(
        start + header.length + 1 + delimiter.length,
        end,
      );
      const tail = reparse(rest.replace(/^\n/u, ""));
      const tailStart = start + header.length + delimiter.length + 2;
      for (const child of tail.children) shift(child, tailStart, startLine + 1);

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
