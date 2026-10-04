import type { Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import { mapLines, shiftByMap } from "./line-map.js";

/** A GFM delimiter row, with or without the outer pipes. */
const DELIMITER =
  /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/** A setext underline, which turns the line above it into a heading. */
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;

/**
 * End a footnote definition where a new block begins.
 *
 * A definition's lazy continuation swallows every following line that is not a
 * new block, so `[^1]: body` followed by a table, or by a setext-underlined
 * heading, parsed as one definition. Obsidian ends the definition and starts the
 * block, including for a pipeless table whose header carries no outer pipes.
 *
 * Every container is searched, not just the document, because a definition
 * inside a quote splits the same way. That needs the quote's `> ` prefixes off
 * before the lines can be matched or re-parsed, so the split runs on a line map
 * and the halves are placed back through it — a constant offset would be wrong
 * on every line after the first.
 */
export function footnoteTableSplitTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = parent.children.length - 1; index >= 0; index--) {
      const definition = parent.children[index];
      if (definition?.type !== "footnoteDefinition") continue;

      const start = definition.position?.start?.offset;
      const end = definition.position?.end?.offset;
      const startLine = definition.position?.start?.line;
      if (start === undefined || end === undefined) continue;
      if (startLine === undefined) continue;

      const map = mapLines(source, start, end, startLine);
      const lines = map.text.split("\n");

      // From line 2: the label's own line can never be a delimiter row, and a
      // header needs a line above it.
      let split = -1;
      for (let line = 2; line < lines.length; line++) {
        const delimiter = lines[line] ?? "";
        const header = lines[line - 1] ?? "";
        if (header.trim() === "") continue;

        // A setext underline makes the line above it a heading, which ends the
        // definition just as a table header does.
        if (SETEXT.test(delimiter) && !delimiter.includes("|")) {
          split = line - 1;
          break;
        }

        if (!DELIMITER.test(delimiter)) continue;
        // Obsidian wants the two rows to agree about outer pipes: a pipeless
        // header under a piped delimiter is not a table to it, and splitting
        // there produced a table where it reports none.
        if (
          header.trimStart().startsWith("|") !==
          delimiter.trimStart().startsWith("|")
        ) {
          continue;
        }
        split = line - 1;
        break;
      }
      if (split <= 0) continue;

      const head = reparse(lines.slice(0, split).join("\n"));
      const tail = reparse(lines.slice(split).join("\n"));
      const opensABlock = tail.children.some(
        (child) => child.type === "table" || child.type === "heading",
      );
      if (head.children.length === 0 || !opensABlock) continue;

      for (const child of head.children) shiftByMap(child, map, 0);
      for (const child of tail.children) shiftByMap(child, map, split);

      parent.children.splice(
        index,
        1,
        ...(head.children as RootContent[]),
        ...(tail.children as RootContent[]),
      );
    }
  });
}
