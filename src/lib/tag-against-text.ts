import type { Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface ParentNode extends Node {
  children: RootContent[];
}

interface TagNode extends Node {
  type: "tag";
  value: string;
}

/**
 * A tag does not start against literal text.
 *
 * Obsidian starts a tag at the start of a line, after whitespace, or where an inline construct
 * has just ended -- `**a**#t`, `[[a]]#t`, `` `c`#t ``, `<b>x</b>#t` and `\*#t` all hold one --
 * and against nothing else. Asked of the app, `a*#t`, `a**#t`, `a_#t`, `a~~#t`, `&amp;#t`,
 * `&copy;#t`, `x]#t` and `[x]]#t` hold no tag: an emphasis marker that pairs with nothing is
 * text, and so is a character reference, which Obsidian's parser decodes inside text rather than
 * as a construct of its own.
 *
 * The tokenizer cannot see either. It runs while an attention sequence is still unpaired and
 * a reference is still a token, so it allows the `#` after every construct; the tree says which
 * of them came to nothing. A tag whose previous sibling is text ending right at its `#` stands
 * against literal text -- unless the character there was escaped, since an escape IS a construct
 * (`[x\]#t` and `\\#t` hold a tag), or is a bracket of a label.
 *
 * A label is a construct to Obsidian whether or not anything defines it: its parser makes a
 * reference of every bracket pair, so `[x]#t`, `[ ]#t`, `[x][]#t`, `![x]#t` and an undefined
 * `[^1]#t` hold a tag, and so does `[#t]` -- while `[]#t`, `[#t`, `[x]]#t` and `[a [b] c]#t`,
 * where no pair closes around a label, hold none. That is the tag's own rule, so `strict`
 * follows it although CommonMark leaves an undefined `[x]` as text. A bracket inside another
 * construct is that construct's: in `[^1[[a\]]#t` the footnote label runs to the first `]`, so
 * the second is literal and holds no tag.
 *
 * Demoted to text rather than dropped, so the characters the author wrote stay in the tree and
 * both `tags` and `meta.tags` lose it together.
 */
export function tagAgainstTextTransform(tree: Root, source: string): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;
    const kids: RootContent[] = parent.children;

    // Rebuilt in one pass rather than spliced per tag, which is quadratic in a long paragraph.
    const out: RootContent[] = [];
    let merging = false;
    kids.forEach((kid, index) => {
      const last = out[out.length - 1] as Text | undefined;
      const demoted =
        kid.type === "tag" && literalBefore(kids, index, parent, source);
      if (last && (demoted || (merging && kid.type === "text"))) {
        last.value +=
          kid.type === "text"
            ? kid.value
            : `#${(kid as unknown as TagNode).value}`;
        if (last.position && kid.position?.end) {
          last.position.end = { ...kid.position.end };
        }
        merging = demoted;
        return;
      }
      merging = false;
      out.push(kid);
    });
    if (out.length !== kids.length) parent.children = out;
  });
}

/** Whether the tag at `index` stands right against literal text in its previous sibling. */
function literalBefore(
  kids: readonly RootContent[],
  index: number,
  parent: Partial<ParentNode>,
  source: string,
): boolean {
  const before = kids[index - 1];
  if (before?.type !== "text") return false;
  const at = kids[index]!.position?.start.offset;
  if (at === undefined || before.position?.end.offset !== at) return false;
  return againstLiteral(
    source,
    at,
    () =>
      bound(kids, index - 2, -1, "end") ?? parent.position?.start.offset ?? 0,
    () =>
      bound(kids, index + 1, 1, "start") ??
      parent.position?.end.offset ??
      source.length,
  );
}

/** The longest link label CommonMark allows, which bounds every scan below. */
const LABEL_LIMIT = 999;

/** Siblings whose source a label may run through: text, and what only wraps text. */
const TRANSPARENT = new Set([
  "text",
  "break",
  "emphasis",
  "strong",
  "delete",
  "highlight",
]);

/**
 * The edge of the nearest construct from `index` onwards in direction `step`, which a bracket
 * scan must not cross: its brackets are its own.
 */
function bound(
  kids: readonly RootContent[],
  index: number,
  step: 1 | -1,
  edge: "start" | "end",
): number | undefined {
  for (let at = index; at >= 0 && at < kids.length; at += step) {
    const kid = kids[at]!;
    if (TRANSPARENT.has(kid.type)) continue;
    return kid.position?.[edge].offset;
  }
  return undefined;
}

/** Whether the character before `at` is literal text: not whitespace, escaped or a label's bracket. */
function againstLiteral(
  source: string,
  at: number,
  floor: () => number,
  ceiling: () => number,
): boolean {
  const char = source.charAt(at - 1);
  if (char === "" || /\s/u.test(char)) return false;
  if (escaped(source, at - 1)) return false;
  if (char === "[") return !closes(source, at, ceiling());
  if (char === "]") return !opens(source, at - 1, floor());
  return true;
}

/** Whether the character at `index` follows an odd run of backslashes. */
function escaped(source: string, index: number): boolean {
  let slashes = 0;
  for (let at = index - 1; at >= 0 && source[at] === "\\"; at--) slashes++;
  return slashes % 2 === 1;
}

/** An unescaped bracket of either kind at `index`, or `undefined`. */
function bracket(source: string, index: number): string | undefined {
  const char = source[index];
  return (char === "[" || char === "]") && !escaped(source, index)
    ? char
    : undefined;
}

/** Whether a `]` comes after `from` before any other bracket: `[#t]` closes, `[#t` does not. */
function closes(source: string, from: number, ceiling: number): boolean {
  const end = Math.min(ceiling, from + LABEL_LIMIT);
  for (let index = from; index < end; index++) {
    const found = bracket(source, index);
    if (found !== undefined) return found === "]";
  }
  return false;
}

/**
 * Whether the `]` at `close` ends a label: a `[` before it with no other bracket between, and
 * something inside -- `[x]` and `[ ]` are labels and `[]` is not, except as the second half of
 * `[x][]`. Obsidian's parser makes a reference of every such pair, defined or not.
 */
function opens(
  source: string,
  close: number,
  floor: number,
  collapsed = false,
): boolean {
  const end = Math.max(floor - 1, close - LABEL_LIMIT);
  for (let index = close - 1; index > end; index--) {
    const found = bracket(source, index);
    if (found === undefined) continue;
    if (found === "]") return false;
    if (index < close - 1) return true;
    // One level only: the first half of `[x][]` must hold something itself.
    return (
      !collapsed &&
      index - 1 >= floor &&
      bracket(source, index - 1) === "]" &&
      opens(source, index - 1, floor, true)
    );
  }
  return false;
}
