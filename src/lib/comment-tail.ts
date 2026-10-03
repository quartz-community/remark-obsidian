import type { Root, RootContent } from "mdast";
import type { Comment } from "./types.js";

/**
 * Re-parse whatever follows a block comment's closing `%%` on the same line.
 *
 * Obsidian ends a comment at its closer wherever that falls and reads the rest of
 * the line as a new block, so `%%\nhidden\n%% [^1]: def` is a comment plus a
 * footnote definition. A flow construct in micromark owns whole lines and cannot
 * stop mid-line, so the tokenizer absorbs that tail into the comment instead —
 * deliberately, because rejecting there used to drop every later line of the note.
 *
 * This puts the block structure back without rewriting the source: the comment is
 * trimmed to its closer and the tail is parsed on its own and spliced in after it.
 * Positions therefore stay true to the document the author wrote.
 */
export function commentTailTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  for (let index = tree.children.length - 1; index >= 0; index--) {
    const node = tree.children[index];
    if (!node || node.type !== "comment") continue;

    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (start === undefined || end === undefined) continue;

    const raw = source.slice(start, end);
    const closer = raw.lastIndexOf("%%");
    if (closer <= 0) continue;

    const tail = raw.slice(closer + 2);
    if (tail.trim() === "") continue;
    // A tail spanning lines means the comment never closed where we think it did.
    if (tail.includes("\n")) continue;

    // Parsed with its leading whitespace intact: Obsidian's section for the tail
    // starts immediately after the `%%`, so stripping it would shift the span.
    const parsed = reparse(tail);
    if (parsed.children.length === 0) continue;

    // The tail was parsed on its own, so its positions start from zero. Shift
    // them onto the document or `sections` slices the wrong range — the tail is
    // single-line by the guard above, so only one line is involved.
    const baseOffset = start + closer + 2;
    const baseLine = node.position?.end?.line ?? 1;
    const baseColumn = (node.position?.end?.column ?? 1) - tail.length;
    const shift = (candidate: unknown): void => {
      const n = candidate as {
        position?: {
          start: { line: number; column: number; offset?: number };
          end: { line: number; column: number; offset?: number };
        };
        children?: unknown[];
      };
      if (n.position) {
        for (const point of [n.position.start, n.position.end]) {
          point.offset = baseOffset + (point.offset ?? 0);
          point.column = baseColumn + point.column - 1;
          point.line = baseLine;
        }
      }
      for (const child of n.children ?? []) shift(child);
    };
    for (const child of parsed.children) shift(child);

    // remark starts a node after any leading whitespace, but Obsidian's section
    // for the tail begins immediately after the `%%`, space included.
    const firstPosition = parsed.children[0]?.position;
    if (firstPosition) {
      firstPosition.start = {
        line: baseLine,
        column: baseColumn,
        offset: baseOffset,
      };
    }

    const comment = node as Comment;
    comment.value = raw.slice(2, closer);
    if (comment.position?.end) {
      comment.position.end = {
        ...comment.position.end,
        offset: start + closer + 2,
        column: comment.position.end.column - tail.length,
      };
    }

    tree.children.splice(index + 1, 0, ...(parsed.children as RootContent[]));
  }
}
