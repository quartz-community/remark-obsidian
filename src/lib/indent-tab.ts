import type { Code, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/** Leading whitespace that begins with one to three spaces. */
const SHORT_INDENT = /^( {1,3}[ \t]*)(?=\S)/u;

/**
 * A tab after one to three spaces does not indent far enough to make code.
 *
 * micromark expands a tab to the next four-column stop, so ` \t` reaches column
 * four and opens an indented code block. `remark-parse@8` does not count a tab
 * that follows a space at all, so the same line is ordinary content -- and since
 * Obsidian parses with `remark-parse@8`, a footnote definition written there is
 * a definition rather than code.
 *
 * Measured against the legacy stack across nine indentations, which is what
 * settles a rule this counter-intuitive. A tab counts fully only when it opens
 * the line:
 *
 *     \t[^1]: def      -> code        (tab opens the line)
 *     \t \t[^1]: def   -> code
 *         [^1]: def    -> code        (four spaces)
 *      \t[^1]: def     -> definition  (one space, then a tab)
 *       \t\t[^1]: def  -> definition
 *        [^1]: def     -> definition  (three spaces)
 *
 * So the line is code only when it opens with a tab or with four spaces, and a
 * tab preceded by any space contributes nothing.
 *
 * Only a single-line block is reinterpreted. A run of indented lines would need
 * each one's own indent weighed against the others, and the recorded families
 * here are all one line.
 */
export function indentTabTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const code = parent.children[index];
      if (code?.type !== "code") continue;
      // Fenced code is explicit and says nothing about indentation.
      if ((code as Code).lang !== null) continue;

      const from = code.position?.start?.offset;
      const to = code.position?.end?.offset;
      if (from === undefined || to === undefined) continue;

      const lineStart = source.lastIndexOf("\n", from - 1) + 1;
      const lineEnd = source.indexOf("\n", to);
      const line = source.slice(
        lineStart,
        lineEnd === -1 ? source.length : lineEnd,
      );
      if (line.includes("\n")) continue;

      const indent = SHORT_INDENT.exec(line);
      if (!indent || !indent[1]!.includes("\t")) continue;

      // Re-parsed without the whitespace that never counted, which is what the
      // legacy tokenizer effectively saw.
      const parsed = reparse(line.slice(indent[1]!.length));
      if (parsed.children.length === 0) continue;
      // Anchored past the whitespace that was stripped, not at the line start.
      // Shifting by `lineStart` alone put the content back on top of its own
      // indent: `  ⇥foo` reported a paragraph spanning `  ⇥` and named the
      // section after it, losing `foo` entirely.
      for (const child of parsed.children) {
        shift(child, lineStart + indent[1]!.length, lineStart, code);
      }

      parent.children.splice(index, 1, ...(parsed.children as RootContent[]));
      index += parsed.children.length - 1;
    }
  });
}

interface Point {
  line: number;
  column: number;
  offset?: number;
}

/**
 * Place a fragment parsed from one line back onto that line.
 *
 * Two anchors, because the fragment was re-parsed with its indentation removed:
 * `contentStart` is where that text really begins, and `lineStart` is what columns
 * are measured from. `normalizePointsTransform` recomputes line and column from the
 * offsets afterwards, so the offset is the part that has to be right.
 */
function shift(
  node: unknown,
  contentStart: number,
  lineStart: number,
  code: RootContent,
): void {
  const candidate = node as {
    position?: { start: Point; end: Point };
    children?: unknown[];
  };
  if (candidate.position && code.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.offset = contentStart + (point.offset ?? 0);
      point.line = code.position.start.line;
      point.column = point.offset - lineStart + 1;
    }
  }
  for (const child of candidate.children ?? []) {
    shift(child, contentStart, lineStart, code);
  }
}
