import type { Paragraph, Root, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/**
 * Re-tokenize a paragraph the block folds rewrote.
 *
 * Inline tokenizing happens once, while parsing. A fold that later pulls a
 * definition label or a setext underline into a paragraph therefore inserts
 * text the tokenizer never saw, and a delimiter inside it stays literal:
 * `para` / `[^1]: a` / `===` / `[^2]: b` / `===` is one paragraph to Obsidian,
 * which highlights across the two `===` runs, while we kept them as text.
 *
 * The paragraph's own source is re-parsed with its line endings replaced by
 * spaces, which forces a single paragraph -- no setext underline, no
 * definition -- so the tokenizer sees the whole run as inline content. The
 * substitution is length-preserving, so every offset still indexes the real
 * source and each resulting text node can be restored to the characters it
 * actually covers, newlines included.
 *
 * Only a paragraph where this *produces a highlight that was not there* is
 * replaced. A delimiter that was already tokenized re-tokenizes to itself, so
 * the pass is inert everywhere else.
 */
export function inlineRefoldTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  visit(tree, "paragraph", (node: Node) => {
    const paragraph = node as Paragraph;
    const from = paragraph.position?.start?.offset;
    const to = paragraph.position?.end?.offset;
    if (from === undefined || to === undefined) return;

    if (!hasLiteralMarker(paragraph)) return;

    const slice = source.slice(from, to);
    if (!slice.includes("\n")) return;

    const parsed = reparse(slice.replace(/\n/gu, " "));
    const only = parsed.children[0];
    if (parsed.children.length !== 1 || only?.type !== "paragraph") return;
    // Compared by how much the refold highlights, not by whether anything was
    // highlighted already. The old guard bailed the moment a highlight existed, so
    // `H` / `  ===` / `[^1]: ==a==` kept the small highlight the first parse found
    // and never formed the large one Obsidian reports -- which opens on the `==` of
    // the former underline and closes on the last `==` three lines down. A paragraph
    // can hold both a delimiter that was judged and one that never was.
    //
    // Both slices are the same length, so the sums are directly comparable.
    if (highlighted(only) <= highlighted(paragraph)) return;

    restore(only, source, from);
    paragraph.children = only.children;
  });
}

/** A `==` left in text is one the tokenizer never got to judge. */
function hasLiteralMarker(paragraph: Paragraph): boolean {
  let found = false;
  visit(paragraph, "text", (node: Node) => {
    if ((node as Text).value.includes("==")) found = true;
  });
  return found;
}

/** How many characters of this paragraph sit inside a highlight. */
function highlighted(root: Node): number {
  let total = 0;
  visit(root, "highlight", (node: Node) => {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (start !== undefined && end !== undefined) total += end - start;
  });
  return total;
}

/**
 * Put the real characters back. The parse ran against a copy whose newlines
 * were spaces, so a text node's value spells those spaces; its offsets are
 * unchanged, which is what lets the source supply the original.
 */
function restore(root: Node, source: string, base: number): void {
  visit(root, (node: Node) => {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (start === undefined || end === undefined) return;
    const absoluteStart = base + start;
    const absoluteEnd = base + end;

    if (node.type === "text") {
      (node as Text).value = source.slice(absoluteStart, absoluteEnd);
    }
    node.position = {
      start: { ...node.position!.start, offset: absoluteStart },
      end: { ...node.position!.end, offset: absoluteEnd },
    };
  });
}
