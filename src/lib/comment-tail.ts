import type { Root, RootContent, Text } from "mdast";
import type { Comment } from "./types.js";
import { span } from "./normalize-points.js";

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
    // THE FIRST `%%` ON THE CLOSING LINE, which is the rule rather than the last one on it:
    // "the closer is the first `%%` anywhere in a later line... text after the closer starts a
    // paragraph that takes lazy lines". `lastIndexOf` over the whole comment agrees whenever the
    // closing line holds ONE `%%` and silently declines when it holds two, because the tail is
    // then empty and the split never happens:
    //
    //     "%%" / "x" / "%% culpa ex %%" / "[^1]: def"   obs no definition, ours one
    //
    // Searching from the last line ending keeps the opener out of reach, so a SINGLE-line
    // comment still lands on offset 0 and is still declined by the guard below.
    const closingLine = raw.lastIndexOf("\n") + 1;
    const onClosingLine = raw.indexOf("%%", closingLine);
    const closer = onClosingLine >= 0 ? onClosingLine : raw.lastIndexOf("%%");
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
    absorbLazyLine(tree, index + parsed.children.length, source);
  }
}

/**
 * A tail keeps reading the line below it, as text written normally would.
 *
 * The tail is parsed on its own, so it ends where the line does, but Obsidian
 * treats it as ordinary Markdown: `%%\nhidden\n%%[^1]: def` followed by `text` is
 * one definition holding both lines, and `%%` / `x` / `%% after` / `lazy` one
 * paragraph -- "text after the closer starts a paragraph that takes lazy lines"
 * (their F2). Without this the line below stays a paragraph of its own.
 */
function absorbLazyLine(tree: Root, index: number, source: string): void {
  const definition = tree.children[index];
  if (
    definition?.type !== "footnoteDefinition" &&
    definition?.type !== "paragraph"
  ) {
    return;
  }

  const next = tree.children[index + 1];
  if (next?.type !== "paragraph") return;

  const end = definition.position?.end?.offset;
  const start = next.position?.start?.offset;
  if (end === undefined || start === undefined) return;
  if (source.slice(end, start) !== "\n") return;

  const host =
    definition.type === "paragraph"
      ? definition
      : definition.children[definition.children.length - 1];
  if (host?.type !== "paragraph") return;

  // The guard above proves the gap is exactly one newline, so it spans `end` to
  // `start` and `breakPositionsTransform` can turn it into a placed `break`.
  host.children.push(
    span<Text>({ type: "text", value: "\n" } as Text, source, end, start),
    ...next.children,
  );
  for (const node of new Set([host, definition])) {
    if (node.position && next.position?.end) {
      node.position.end = { ...next.position.end };
    }
  }
  tree.children.splice(index + 1, 1);
}
