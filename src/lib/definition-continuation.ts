import type { Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { shiftByMap, type LineMap } from "./line-map.js";

/** The continuation indent a footnote definition's later blocks sit at. */
const CONTINUATION_INDENT = /^ {0,4}/u;

/**
 * Absorb an indented block into the footnote definition above it.
 *
 * `micromark-extension-gfm-footnote` takes a definition's indented
 * continuation while parsing, so `[^1]: a` / blank / `    more` is a single
 * definition holding two blocks. A definition that another transform produced
 * was never seen by that parser -- splitting `%% [^1]: body` off a comment
 * closer is the case -- so its continuation is left behind as a sibling, and
 * an indented one surfaces as a root-level code block Obsidian never shows.
 *
 * Only a block separated by exactly one blank line is taken, which is the gap
 * the parser itself requires. The four-space indent is stripped before
 * re-parsing so the result is what the parser would have built: four spaces
 * is a paragraph, eight is still code.
 */
export function definitionContinuationTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = parent.children.length - 1; index > 0; index--) {
      const block = parent.children[index];
      const definition = parent.children[index - 1];
      if (block?.type !== "code" || definition?.type !== "footnoteDefinition") {
        continue;
      }
      const from = block.position?.start?.offset;
      const to = block.position?.end?.offset;
      const startLine = block.position?.start?.line;
      const definitionEnd = definition.position?.end?.offset;
      if (from === undefined || to === undefined) continue;
      if (startLine === undefined || definitionEnd === undefined) continue;
      if (source.slice(definitionEnd, from) !== "\n\n") continue;
      // Indented, not fenced. Both are `code` in mdast and an unclosed fence
      // has no language either, so the opening delimiter is the only thing
      // that tells them apart -- and swallowing a fence hides content
      // Obsidian renders.
      if (!/^ {4}/u.test(source.slice(from, from + 4))) continue;

      const map = dedent(source, from, to, startLine);
      const parsed = reparse(map.text);
      for (const child of parsed.children) shiftByMap(child, map, 0);

      definition.children.push(
        ...(parsed.children as typeof definition.children),
      );
      if (definition.position && block.position) {
        definition.position.end = { ...block.position.end };
      }
      parent.children.splice(index, 1);
    }
  });
}

/** Strip the continuation indent, remembering where each line really began. */
function dedent(
  source: string,
  start: number,
  end: number,
  startLine: number,
): LineMap {
  const raw = source.slice(start, end).split("\n");
  const text: string[] = [];
  const starts: number[] = [];
  const lines: number[] = [];
  let offset = start;

  for (let index = 0; index < raw.length; index++) {
    const line = raw[index]!;
    const indent = CONTINUATION_INDENT.exec(line)?.[0] ?? "";
    starts.push(offset + indent.length);
    lines.push(startLine + index);
    text.push(line.slice(indent.length));
    offset += line.length + 1;
  }

  return { text: text.join("\n"), starts, lines };
}
