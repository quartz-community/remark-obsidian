import type { Root, RootContent } from "mdast";

/** A GFM delimiter row, with or without the outer pipes. */
const DELIMITER =
  /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/** A setext underline, which turns the line above it into a heading. */
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;

/** Shift a subtree parsed in isolation onto its place in the document. */
function shift(node: unknown, offset: number, line: number): void {
  const n = node as {
    position?: {
      start: { line: number; column: number; offset?: number };
      end: { line: number; column: number; offset?: number };
    };
    children?: unknown[];
  };
  if (n.position) {
    for (const point of [n.position.start, n.position.end]) {
      point.offset = offset + (point.offset ?? 0);
      point.line = line + point.line - 1;
    }
  }
  for (const child of n.children ?? []) shift(child, offset, line);
}

/**
 * End a footnote definition where a new block begins.
 *
 * A definition's lazy continuation swallows every following line that is not a
 * new block, so `[^1]: body` followed by a table, or by a setext-underlined
 * heading, parsed as one definition. Obsidian ends the definition and starts the
 * block, including for a pipeless table whose header carries no outer pipes.
 *
 * The split is done by re-parsing each half rather than by rewriting the source,
 * so positions stay true to the document. Columns need no adjustment because the
 * tail always begins at the start of a line.
 */
export function footnoteTableSplitTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  for (let index = tree.children.length - 1; index >= 0; index--) {
    const node = tree.children[index];
    if (!node || node.type !== "footnoteDefinition") continue;

    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    const startLine = node.position?.start?.line;
    if (start === undefined || end === undefined || startLine === undefined) {
      continue;
    }

    const lines = source.slice(start, end).split("\n");
    // From line 2: the label's own line can never be a delimiter row, and a
    // header needs a line above it.
    let split = -1;
    for (let i = 2; i < lines.length; i++) {
      const delimiter = lines[i] ?? "";
      const header = lines[i - 1] ?? "";
      if (header.trim() === "") continue;

      // A setext underline makes the line above it a heading, which ends the
      // definition just as a table header does.
      if (SETEXT.test(delimiter) && !delimiter.includes("|")) {
        split = i - 1;
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
      split = i - 1;
      break;
    }
    if (split <= 0) continue;

    const head = lines.slice(0, split).join("\n");
    const tail = lines.slice(split).join("\n");
    const parsedHead = reparse(head);
    const parsedTail = reparse(tail);
    const opensABlock = parsedTail.children.some(
      (child) => child.type === "table" || child.type === "heading",
    );
    if (parsedHead.children.length === 0 || !opensABlock) continue;

    for (const child of parsedHead.children) shift(child, start, startLine);
    const tailOffset = start + head.length + 1;
    for (const child of parsedTail.children) {
      shift(child, tailOffset, startLine + split);
    }

    tree.children.splice(
      index,
      1,
      ...(parsedHead.children as RootContent[]),
      ...(parsedTail.children as RootContent[]),
    );
  }
}
