import type {
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  Text,
} from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { span } from "./normalize-points.js";

interface ParentNode extends Node {
  children: RootContent[];
}

const BLANK = /^[ \t]*\n[ \t]*$/;

interface Point {
  line: number;
  column: number;
  offset?: number;
}

/**
 * A GFM table cannot interrupt a paragraph in Obsidian.
 *
 * micromark lets one start on the line after prose, so `text` followed by
 * `| a | b |` and a delimiter row becomes a paragraph plus a table. Obsidian keeps
 * reading the paragraph and renders the pipes literally. Forgetting the blank line
 * above a table is common enough in real notes that the two readings diverge often.
 *
 * The table is folded back in by parsing each of its lines on its own. Re-parsing
 * the combined slice would not work: it would simply build the same table again,
 * because the delimiter row is still there. One line at a time never has a
 * delimiter row to pair with, so each is read as the inline content it is.
 *
 * It does not apply to a table indented into a FOOTNOTE DEFINITION. Rule C4 of
 * the upstream reading rules is "a table interrupts a definition but not a
 * paragraph", and in mdast a definition's text IS a paragraph, so the fold above
 * cannot tell the two apart by node type alone. An indented table is the
 * definition's own content, and burying it takes the references in its rows with
 * it: `[^1]: body` over an indented `| c[^2] | d |` loses `[^2]` entirely.
 *
 * The INDENT is the boundary, and it was measured rather than reasoned. The pass
 * fires in 45 documents -- 32 of 46 fires hosted by `footnoteDefinition`, 13 by
 * root, 1 by a list item -- so this is its majority population and not a corner
 * of it. Excluding every definition host scores 1 gain / 1 BREAK: the loss is a
 * table at column 0 under a definition line whose label Obsidian does not resolve
 * at all, which is the separate question of whether a definition ENDS there.
 * Bounded to an indented table it is 1 / 0.
 */
export function tableInterruptTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length - 1; index++) {
      const paragraph = parent.children[index];
      const table = parent.children[index + 1];
      if (paragraph?.type !== "paragraph" || table?.type !== "table") continue;

      const gapStart = paragraph.position?.end?.offset;
      const gapEnd = table.position?.start?.offset;
      const tableEnd = table.position?.end?.offset;
      if (gapStart === undefined || gapEnd === undefined) continue;
      if (tableEnd === undefined) continue;
      if (!BLANK.test(source.slice(gapStart, gapEnd))) continue;
      if (interruptsDefinition(node, table)) continue;

      let lineOffset = gapEnd;
      let lineNumber = table.position?.start?.line ?? 1;

      for (const line of source.slice(gapEnd, tableEnd).split("\n")) {
        const parsed = reparse(line);
        const block = parsed.children[0];
        const children =
          block?.type === "paragraph"
            ? block.children
            : ([] as PhrasingContent[]);

        for (const child of children) shift(child, lineOffset, lineNumber);
        (paragraph as Paragraph).children.push(
          span<Text>(
            { type: "text", value: "\n" } as Text,
            source,
            lineOffset - 1,
            lineOffset,
          ) as PhrasingContent,
          ...children,
        );

        lineOffset += line.length + 1;
        lineNumber += 1;
      }

      if (paragraph.position && table.position?.end) {
        paragraph.position.end = { ...table.position.end };
      }
      parent.children.splice(index + 1, 1);
      index--;
    }
  });
}

function interruptsDefinition(host: Node, table: Table): boolean {
  const indented = (table.position?.start.column ?? 1) > 1;
  return host.type === "footnoteDefinition" && indented;
}

function shift(node: unknown, offset: number, line: number): void {
  const candidate = node as {
    position?: { start: Point; end: Point };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.offset = offset + (point.offset ?? 0);
      point.line = line;
    }
  }
  for (const child of candidate.children ?? []) shift(child, offset, line);
}
