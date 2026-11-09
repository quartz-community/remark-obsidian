import type { Root, RootContent, Text } from "mdast";
import type { Node } from "unist";

import { isTagCharacter } from "./tag-char.js";
import { visit } from "./visit.js";

/**
 * The twelve pictographs Obsidian reads as a highlight's colour when one opens its content
 * (`==🔴 text==` renders `<mark data-highlight="red"> text</mark>`): red, orange, yellow, green,
 * blue and purple, each as a circle and as a square. The same closed set as
 * `rehype-obsidian`'s `coloured-highlights.ts`, which does the colouring; brown, black and white
 * are no markers.
 */
const COLOUR_MARKERS = new Set([
  0x1f534, 0x1f7e5, 0x1f7e0, 0x1f7e7, 0x1f7e1, 0x1f7e8, 0x1f7e2, 0x1f7e9,
  0x1f535, 0x1f7e6, 0x1f7e3, 0x1f7ea,
]);

/** The length in UTF-16 units of the colour marker opening `content`, or 0. */
export function colourMarkerLength(content: string): number {
  const first = content.codePointAt(0);
  return first !== undefined && COLOUR_MARKERS.has(first) ? 2 : 0;
}

/** The length of the tag opening `value` (`#` included), or 0, by both presets' tag rule. */
function tagLength(value: string): number {
  if (value.charAt(0) !== "#") return 0;
  let end = 1;
  let nonDigit = false;
  for (const character of value.slice(1)) {
    if (!isTagCharacter(character)) break;
    if (!/[0-9]/u.test(character)) nonDigit = true;
    end += character.length;
  }
  return end > 1 && nonDigit ? end : 0;
}

/**
 * A tag straight after a highlight's colour marker, under `strict`: Obsidian consumes the marker
 * and reads the content after it, so `==🔴#t==` holds the tag `t` (recorded on 1.15.0), where
 * the marker is a tag character that the `#` stands against. Only the first marker, opening the
 * content: `==🔴🔵#t==` and `==a🔴#t==` hold none. The marker stays in the tree as text, as it
 * stays in the file; `rehype-obsidian` removes it where it becomes a colour. `legacy` splits the
 * highlight's content in its reader instead.
 */
export function colourMarkerTagTransform(tree: Root, source: string): void {
  visit(tree, "highlight", (node: Node) => {
    const children = (node as unknown as { children: RootContent[] }).children;
    const first = children[0];
    if (first?.type !== "text") return;
    const marker = colourMarkerLength(first.value);
    if (marker === 0) return;
    const length = tagLength(first.value.slice(marker));
    if (length === 0) return;
    const start = first.position?.start;
    // An escaped `\#` is text: the text node holds the `#` alone, the source its backslash.
    if (!start || source.charAt((start.offset ?? 0) + marker) !== "#") return;
    const at = (columns: number) =>
      start && {
        line: start.line,
        column: start.column + columns,
        offset: (start.offset ?? 0) + columns,
      };
    const place = (from: number, to: number) =>
      start ? { position: { start: at(from)!, end: at(to)! } } : {};
    const end = marker + length;
    const rest = first.value.slice(end);
    const split: RootContent[] = [
      {
        type: "text",
        value: first.value.slice(0, marker),
        ...place(0, marker),
      },
      {
        type: "tag",
        value: first.value.slice(marker + 1, end),
        ...place(marker, end),
      } as unknown as RootContent,
    ];
    if (rest !== "") {
      split.push({
        type: "text",
        value: rest,
        ...(first.position
          ? { position: { start: at(end)!, end: first.position.end } }
          : {}),
      } as Text);
    }
    children.splice(0, 1, ...split);
  });
}
