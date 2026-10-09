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

    const literal = literalMarkers(paragraph);
    if (!literal.highlight && !literal.math && !literal.note) return;

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
    const gainedHighlight =
      literal.highlight && highlighted(only) > highlighted(paragraph);
    const gainedMath = literal.math && mathed(only) > mathed(paragraph);
    const gainedNote = literal.note && noted(only) > noted(paragraph);
    if (!gainedHighlight && !gainedMath && !gainedNote) return;

    restore(only, source, from);
    paragraph.children = only.children;
  });
}

/** The legacy constructs whose body is chunked at every line ending. */
const WRAPPERS = new Set(["emphasis", "strong", "delete", "highlight"]);

/**
 * Which delimiters are sitting in text, where the tokenizer never got to judge them.
 *
 * Reported per marker rather than as one boolean, because each clause of the gate
 * below needs evidence for *its own* construct. `y^2$` / `$y^2$` / `===` holds a
 * literal `==` and no literal `$$`, and its single-`$` math is already correct; a
 * shared boolean let the math clause fire on the `==` and replaced a right answer
 * with a wrong one.
 *
 * `$$` is here at all because a legacy wrapper cannot let an inline construct cross a
 * line ending: `planBody` has to emit every line ending as its own token, so
 * `_$$y^2` / `y^2$$_` leaves two text nodes and a `break` where Obsidian reports one
 * display math. Consuming the line ending inside the token is what desynchronises the
 * chunked chain, which is why that route is closed and this one is open.
 */
function literalMarkers(paragraph: Paragraph): {
  highlight: boolean;
  math: boolean;
  note: boolean;
} {
  let highlight = false;
  let math = false;
  let note = false;
  // Walked rather than visited, because for math it matters *where* the delimiter is.
  // A legacy wrapper chunks its body at every line ending, so a span inside one cannot
  // cross it however well formed -- that is the defect this pass works around. At
  // paragraph level there is no such obstacle: micromark saw the whole run and its
  // answer stands, so re-tokenizing there replaces a considered reading with a
  // differently-paired one. Measured: without the ancestry test, `y^2$` / `$y^2$` /
  // `===` and `probe/math-unclosed/lone-closer-then-inline` both regress, and both
  // hold their dollars directly under the paragraph.
  //
  // `==` keeps its old, position-blind test, which is measured and working.
  const walk = (node: Node, inWrapper: boolean): void => {
    if (node.type === "text") {
      const value = (node as Text).value;
      if (value.includes("==")) highlight = true;
      if (inWrapper && value.includes("$")) math = true;
      // An inline note cannot span a *lazy* continuation line -- measured on all four
      // shapes: `- ^[i` / `e]` and `> ^[i` / `e]` both fail while `- ^[i` / `  e]` and
      // `> ^[i` / `> e]` succeed, as does the same text at root. Position-blind like
      // the highlight clause, and self-limiting for the same reason: where micromark
      // already builds the note, the refold produces no new one and nothing happens.
      if (value.includes("^[")) note = true;
      return;
    }
    const inner = inWrapper || WRAPPERS.has(node.type);
    for (const child of (node as { children?: Node[] }).children ?? []) {
      walk(child, inner);
    }
  };
  walk(paragraph, false);
  return { highlight, math, note };
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

function noted(root: Node): number {
  let total = 0;
  visit(root, "footnote", () => {
    total += 1;
  });
  return total;
}

function mathed(root: Node): number {
  let total = 0;
  for (const type of ["inlineMath", "math"]) {
    visit(root, type, (node: Node) => {
      const start = node.position?.start?.offset;
      const end = node.position?.end?.offset;
      if (start !== undefined && end !== undefined) total += end - start;
    });
  }
  return total;
}

/**
 * The value with its substituted line endings back, and nothing else changed.
 *
 * Taking the raw slice wholesale does restore them, and throws away every other
 * decision the tokenizer made about those characters. `\*\* ` resolves to `** `, so
 * the raw slice spells the backslashes again and the next format pass escapes them
 * once more -- `\\\*\\\* `, doubling every pass, without bound. That accounted for
 * five of the seven documents formatting could never settle.
 *
 * The two strings differ only in ways this can walk past: a `\n` the copy spells as
 * a space, and characters the tokenizer consumed without emitting, such as an
 * escape's backslash or the tail of a character reference. Matching forward and
 * taking the newline only where both sides agree on its position restores the line
 * endings and leaves resolution alone.
 *
 * A continuation line's own indentation is dropped with the same justification. The
 * block parser strips it before any inline tokenizer sees it, so a construct spanning
 * a line ending never holds it -- `==a` / `··===` is the highlight `a⏎=` to Obsidian,
 * not `a⏎··=`. The flat slice this re-parses has no container structure to strip it,
 * so it is stripped here, where the line endings are already being put back.
 */
function withLineEndings(raw: string, value: string): string {
  let out = "";
  let at = 0;
  let index = 0;

  while (index < value.length) {
    const character = value[index]!;
    while (at < raw.length && raw[at] !== character) {
      if (raw[at] === "\n" && character === " ") break;
      at += 1;
    }

    if (raw[at] === "\n" && character === " ") {
      out += "\n";
      at += 1;
      index += 1;
      // Past the newline, skip whatever whitespace opened the next line.
      while (
        at < raw.length &&
        (raw[at] === " " || raw[at] === "\t") &&
        value[index] === raw[at]
      ) {
        at += 1;
        index += 1;
      }
      continue;
    }

    out += character;
    at += 1;
    index += 1;
  }

  return out;
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
      const held = node as Text;
      held.value = withLineEndings(
        source.slice(absoluteStart, absoluteEnd),
        held.value,
      );
    } else if (node.type === "inlineMath" || node.type === "math") {
      // A math node's value is its tex, so it excludes the `$` delimiters its span
      // includes. The substitution was length-preserving, so the real tex is the same
      // length as the spaces-for-newlines one and the delimiters are what is left
      // over -- which locates them without parsing them, and without assuming how
      // many there are.
      const raw = source.slice(absoluteStart, absoluteEnd);
      const held = node as unknown as { value: string };
      const pad = (raw.length - held.value.length) / 2;
      if (Number.isInteger(pad) && pad > 0) {
        held.value = raw.slice(pad, raw.length - pad);
      }
    }
    node.position = {
      start: { ...node.position!.start, offset: absoluteStart },
      end: { ...node.position!.end, offset: absoluteEnd },
    };
  });
}
