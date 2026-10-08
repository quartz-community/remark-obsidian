import type { Root } from "mdast";
import { visit } from "unist-util-visit";

/** A line holding whitespace and nothing else, but not an empty line. */
const BLANK_RUN = /^[ \t]+$/u;

/**
 * Take a trailing whitespace-only line into the footnote definition above it.
 *
 * The arbiter settles this in four shapes, and the rule turns on what *follows* the
 * line rather than on the definition's own content:
 *
 *     [^1]:⏎······          one definition, spanning both lines
 *     [^1]: b⏎······        the same, so a body makes no difference
 *     [^1]:⏎···⏎x           definition stops at line one, `x` is its own paragraph
 *     [^1]:⏎⏎---            a truly empty line ends it too
 *
 * So a whitespace-only line is absorbed only when nothing but whitespace follows it to
 * the end of the document. Obsidian reports `[^1]:` over six spaces as a single
 * `footnoteDefinition` section covering them, which agrees.
 *
 * This does not fight `definitionTrimTransform`, which exists to pull a definition
 * *back* off a blank line. Every shape that pass was measured on has content after the
 * blank, which makes the blank interior; this one only ever extends over a blank with
 * nothing after it, so the two cannot both apply to the same line. It does have to run
 * after that pass: an earlier placement was silently undone, which looks exactly like a
 * pass that never fired.
 */
export function definitionBlankTailTransform(tree: Root, source: string): void {
  if (source === "") return;

  visit(tree, "footnoteDefinition", (node) => {
    const end = node.position?.end?.offset;
    const line = node.position?.end?.line;
    if (end === undefined || line === undefined) return;
    if (source[end] !== "\n") return;

    let cursor = end;
    let lastEnd = -1;
    let lastLine = line;
    let lastWidth = 0;

    // Whole lines forward. A line with content cancels the extension outright rather
    // than stopping at the blank before it, which is what the third shape above says.
    for (let at = line; source[cursor] === "\n"; at++) {
      const from = cursor + 1;
      const breakAt = source.indexOf("\n", from);
      const to = breakAt === -1 ? source.length : breakAt;
      const text = source.slice(from, to);
      // The empty string after the document's final newline is the end, not a line.
      if (text === "" && breakAt === -1) break;
      if (!BLANK_RUN.test(text)) return;
      lastEnd = to;
      lastLine = at + 1;
      lastWidth = text.length;
      cursor = to;
    }

    if (lastEnd === -1) return;
    node.position!.end = {
      line: lastLine,
      column: lastWidth + 1,
      offset: lastEnd,
    };
  });
}
