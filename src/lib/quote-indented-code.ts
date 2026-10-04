import type { Code, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface ParentNode extends Node {
  children: RootContent[];
}

interface Point {
  line: number;
  column: number;
  offset?: number;
}

const QUOTED = /^[ \t]*>/;
const INDENTED = /^ {4,}\S/;

/**
 * An indented line below a quote is code, not lazy continuation.
 *
 * CommonMark cannot start indented code inside a paragraph, so `> quote` /
 * `> more` / `    code` reads the third line as more of the quoted paragraph.
 * Obsidian ends the quote there and opens a code block, which changes what the
 * text means — code is literal, so a `[^1]` in it stays written.
 */
export function quoteIndentedCodeTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const quote = parent.children[index];
      if (quote?.type !== "blockquote") continue;

      const start = quote.position?.start?.offset;
      const end = quote.position?.end?.offset;
      const line = quote.position?.start?.line;
      if (start === undefined || end === undefined || line === undefined) {
        continue;
      }

      const lines = source.slice(start, end).split("\n");
      let cut = lines.length;
      while (cut > 0) {
        const candidate = lines[cut - 1]!;
        if (QUOTED.test(candidate) || !INDENTED.test(candidate)) break;
        cut--;
      }
      if (cut === lines.length || cut === 0) continue;

      const kept = lines.slice(0, cut).join("\n");
      const parsed = reparse(kept);
      if (parsed.children.length !== 1) continue;

      const replacement = parsed.children[0]!;
      for (const child of [replacement]) shift(child, start, line - 1);

      const tail = lines.slice(cut);
      const block: Code = {
        type: "code",
        lang: null,
        meta: null,
        value: tail.map((text) => text.slice(4)).join("\n"),
        position: {
          start: {
            line: line + cut,
            column: 1,
            offset: start + kept.length + 1,
          },
          end: { line: line + lines.length - 1, column: 1, offset: end },
        },
      };

      parent.children.splice(index, 1, replacement, block);
      index++;
    }
  });
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
