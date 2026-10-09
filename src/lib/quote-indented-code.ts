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
const CODE_INDENT = 4;

/**
 * The indent a line needs before it counts as code here.
 *
 * Measured from the container's own content column, not from column zero. A
 * footnote definition continues at four spaces, so inside one those four are the
 * continuation and code needs eight -- `[^1]: > [!note` over `    [[target]]` is
 * the quote's lazy continuation, and cutting it into code lost the wikilink
 * Obsidian indexes. At root there is no prefix and the threshold is unchanged.
 *
 * Asked of the **ancestry** and not of the quote's immediate parent, which is what
 * `fuzz/embed/56` forces: `[^1]: > > <ma` over `    target]]. [![[#tag]]](u)` nests a
 * quote inside a quote, so the inner one's parent is a `blockquote` and the four-space
 * threshold came back even though the definition's own continuation is what those four
 * spaces are. The outer quote was already right, which is why the bug needed two levels
 * to show.
 */
function codeIndent(inDefinition: boolean): number {
  return inDefinition ? CODE_INDENT * 2 : CODE_INDENT;
}

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
  /** Every node under a footnote definition, whose four spaces are continuation. */
  const inDefinition = new Set<Node>();
  visit(tree, "footnoteDefinition", (node: Node) => {
    visit(node, (inner: Node) => {
      inDefinition.add(inner);
    });
  });

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

      const want = codeIndent(inDefinition.has(quote));
      const indented = (text: string): boolean =>
        text.length > want &&
        text.slice(0, want).trim() === "" &&
        text.charAt(want) !== " " &&
        text.slice(want).trim() !== "";

      const lines = source.slice(start, end).split("\n");
      let cut = lines.length;
      while (cut > 0) {
        const candidate = lines[cut - 1]!;
        if (QUOTED.test(candidate) || !indented(candidate)) break;
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
        value: tail.map((text) => text.slice(want)).join("\n"),
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
