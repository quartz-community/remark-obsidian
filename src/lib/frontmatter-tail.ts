import type { Root, RootContent } from "mdast";

import { shiftByMap, type LineMap } from "./line-map.js";

/**
 * Close frontmatter on a `---` that carries a tail, and parse the tail.
 *
 * `micromark-extension-frontmatter` requires the closing fence to be alone on
 * its line: anything after it makes the whole construct fail, so
 * `---` / `a: b` / `---[^2]: x` arrives as a thematic break and the document
 * loses its frontmatter entirely. Obsidian closes at the `---` and reads the
 * rest of that line as ordinary Markdown, so the measured answer is a `yaml`
 * block followed by a footnote definition.
 *
 * This repairs the tree rather than patching the extension. Returning `ok`
 * from the extension's `closeAfter` mid-line was tried first and does not
 * work -- a flow construct cannot legally stop in the middle of a line, and
 * micromark discards it and falls back to a thematic break. Making it legal
 * would mean restructuring how that construct tokenizes its closing line,
 * which is a great deal more than absorbing a small package for a small
 * change.
 */
export function frontmatterTailTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  // An exact `---` first line, which is the only thing that opens frontmatter.
  if (!source.startsWith("---\n")) return;

  const lines = source.split("\n");
  let closeIndex = -1;
  for (let index = 1; index < lines.length; index++) {
    if (lines[index]!.startsWith("---")) {
      closeIndex = index;
      break;
    }
  }
  if (closeIndex === -1) return;

  const tail = lines[closeIndex]!.slice(3);
  // A bare closer, with or without trailing spaces, is what upstream already
  // handles correctly. Only a real tail needs repairing.
  if (tail.trim() === "") return;

  let offset = 0;
  const lineStarts = lines.map((line) => {
    const start = offset;
    offset += line.length + 1;
    return start;
  });

  const closeEnd = lineStarts[closeIndex]! + 3;
  const rest = [tail, ...lines.slice(closeIndex + 1)].join("\n");

  // The tail shares its line with the closing fence, so the first mapped line
  // begins mid-line while every later one begins at its own start.
  const map: LineMap = {
    text: rest,
    starts: [
      closeEnd,
      ...lines
        .slice(closeIndex + 1)
        .map((_, index) => lineStarts[closeIndex + 1 + index]!),
    ],
    lines: [
      closeIndex + 1,
      ...lines.slice(closeIndex + 1).map((_, index) => closeIndex + 2 + index),
    ],
  };

  const parsed = reparse(rest);
  for (const child of parsed.children) shiftByMap(child, map, 0);

  // Obsidian's block begins where the fence ends, not where its content does,
  // so `--- trailing` reports a paragraph of " trailing" with the space. The
  // re-parse skipped that space, so the first block's start is pulled back.
  const first = parsed.children[0];
  if (first?.position) {
    first.position.start = {
      line: closeIndex + 1,
      column: 4,
      offset: closeEnd,
    };
  }

  const yaml = {
    type: "yaml",
    value: lines.slice(1, closeIndex).join("\n"),
    position: {
      start: { line: 1, column: 1, offset: 0 },
      end: {
        line: closeIndex + 1,
        column: 4,
        offset: closeEnd,
      },
    },
  } as unknown as RootContent;

  tree.children = [yaml, ...(parsed.children as RootContent[])];
}
