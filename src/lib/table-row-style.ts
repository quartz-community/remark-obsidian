import type { Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface Point {
  line: number;
  column: number;
  offset?: number;
}

const outerPiped = (line: string): boolean => line.trimStart().startsWith("|");

function shift(node: unknown, offset: number, line: number): void {
  const candidate = node as {
    position?: { start: Point; end: Point };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.offset = offset + (point.offset ?? 0);
      point.line = line + point.line - 1;
    }
  }
  for (const child of candidate.children ?? []) shift(child, offset, line);
}

/**
 * A body row has to carry outer pipes if the header did.
 *
 * GFM lets every row choose independently, so `| a | b |` over `| --- | --- |`
 * keeps reading `c | d` as a row. Obsidian ends the table there and reads the
 * rest as prose — visibly, since the pipe then shows up in the text.
 *
 * This is not `remark-parse@8`'s rule either. Measured against the legacy stack,
 * it makes `c | d` a row like GFM does, so unlike emphasis, highlight and link
 * reference definitions there is no tokenizer to port here: Obsidian's table
 * handling is its own, and the rule is derived from the recorded output.
 */
export function tableRowStyleTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const table = parent.children[index];
      if (table?.type !== "table") continue;

      const start = table.position?.start?.offset;
      const end = table.position?.end?.offset;
      const startLine = table.position?.start?.line;
      if (start === undefined || end === undefined || startLine === undefined) {
        continue;
      }

      const lines = source.slice(start, end).split("\n");
      const header = lines[0];
      if (header === undefined || lines.length < 3) continue;

      let cut = -1;
      for (let line = 2; line < lines.length; line++) {
        if (outerPiped(lines[line]!) !== outerPiped(header)) {
          cut = line;
          break;
        }
      }
      if (cut === -1) continue;

      const head = lines.slice(0, cut).join("\n");
      const tail = lines.slice(cut).join("\n");
      const parsedHead = reparse(head);
      const parsedTail = reparse(tail);
      if (parsedHead.children.length === 0) continue;
      if (parsedHead.children[0]?.type !== "table") continue;

      for (const child of parsedHead.children) shift(child, start, startLine);
      const tailOffset = start + head.length + 1;
      for (const child of parsedTail.children) {
        shift(child, tailOffset, startLine + cut);
      }

      parent.children.splice(
        index,
        1,
        ...(parsedHead.children as RootContent[]),
        ...(parsedTail.children as RootContent[]),
      );
      index += parsedHead.children.length + parsedTail.children.length - 1;
    }
  });
}
