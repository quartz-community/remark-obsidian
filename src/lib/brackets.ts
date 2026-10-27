import type { RootContent } from "mdast";

/**
 * Bracket pairs as Obsidian's parser sees them, for the passes deciding what may follow one.
 *
 * Obsidian's parser makes a reference of every bracket pair whose text holds no other bracket,
 * defined or not, so `[x]` is a construct there even where CommonMark leaves it as text. These
 * read the SOURCE, bounded by the construct siblings around the node in question: a bracket
 * inside another construct is that construct's.
 */

/** The longest link label CommonMark allows, which bounds every scan below. */
export const LABEL_LIMIT = 999;

/** Siblings whose source a label may run through: text, and what only wraps text. */
export const TRANSPARENT = new Set([
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
export function bound(
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

/** Whether the character at `index` follows an odd run of backslashes. */
export function escaped(source: string, index: number): boolean {
  let slashes = 0;
  for (let at = index - 1; at >= 0 && source[at] === "\\"; at--) slashes++;
  return slashes % 2 === 1;
}

/** An unescaped bracket of either kind at `index`, or `undefined`. */
export function bracket(source: string, index: number): string | undefined {
  const char = source[index];
  return (char === "[" || char === "]") && !escaped(source, index)
    ? char
    : undefined;
}

/** Whether a `]` comes after `from` before any other bracket: `[#t]` closes, `[#t` does not. */
export function closes(source: string, from: number, ceiling: number): boolean {
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
export function opens(
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

/** The `[` pairing with the `]` at `close`, with no other bracket between them, if there is one. */
export function pairBefore(
  source: string,
  close: number,
  floor: number,
): number | undefined {
  const end = Math.max(floor - 1, close - LABEL_LIMIT);
  for (let index = close - 1; index > end; index--) {
    const found = bracket(source, index);
    if (found === undefined) continue;
    return found === "[" ? index : undefined;
  }
  return undefined;
}

/**
 * The `[` opening the bracket run that the `]` at `close` ends, counting nested pairs -- link
 * text may hold balanced brackets, so `[a [b] c]` is one run -- or `undefined`.
 */
export function balancedOpen(
  source: string,
  close: number,
  floor: number,
): number | undefined {
  let depth = 0;
  const end = Math.max(floor - 1, close - LABEL_LIMIT);
  for (let index = close - 1; index > end; index--) {
    const found = bracket(source, index);
    if (found === "]") depth++;
    else if (found === "[") {
      if (depth === 0) return index;
      depth--;
    }
  }
  return undefined;
}
