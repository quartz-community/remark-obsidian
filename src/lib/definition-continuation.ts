import type { Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { shiftByMap, type LineMap } from "./line-map.js";

/** A definition line ending at its colon, with nothing after it at all. */
const BARE_COLON = /^[ \t]*\[\^[^\]\n]*\]:$/u;

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

/**
 * Take the line immediately below a footnote definition into it.
 *
 * A definition whose first line carries content already absorbs what follows, by
 * ordinary lazy continuation: `[^1]: one` / `b` is one definition and needs nothing
 * here. But lazy continuation needs an open paragraph to continue, and there is none
 * when the first line is empty or is a bare container opener, so micromark ends the
 * definition and leaves a sibling:
 *
 *     [^1]: ⏎b          definition, then a paragraph -- Obsidian has one definition
 *     [^1]: >⏎b         the blockquote opens nothing to continue
 *     [^1]: -⏎b         the same for a list
 *     [^1]: > >⏎b       and for a nested one
 *
 * Only a block with no blank line before it, because a blank line ends a definition
 * -- `[^1]: one` / blank / `b` really is two blocks, and
 * `comment-definition-extent.ts` relies on that same boundary.
 *
 * Restricted to a paragraph, and measured rather than assumed: widening it to any
 * block gains nothing and breaks **16** cases, among them
 * `hunt/interrupting-block-keeps-definition-open` and
 * `hunt/lazy-continuation-paragraph-lines`. An interrupting block really does end a
 * definition; only a paragraph continues one. The absorbed block is appended to the definition
 * rather than pushed inside a trailing container: Obsidian renders an unreferenced
 * definition as nothing, so its `html` is empty and the only evidence available --
 * the definition's `sections` span and an empty rendered `text` -- is satisfied
 * either way. Nesting it would be inventing structure nothing measures.
 */
export function definitionLazyTransform(tree: Root, source: string): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = parent.children.length - 1; index > 0; index--) {
      const block = parent.children[index];
      const definition = parent.children[index - 1];
      if (block?.type !== "paragraph") continue;
      if (definition?.type !== "footnoteDefinition") continue;

      const definitionEnd = definition.position?.end?.offset;
      const from = block.position?.start?.offset;
      const definitionStart = definition.position?.start?.offset;
      if (definitionEnd === undefined || from === undefined) continue;
      if (definitionStart === undefined) continue;
      if (source.slice(definitionEnd, from) !== "\n") continue;

      // Something has to follow the colon, even if only a space. A **bare**
      // `[^1]:` absorbs nothing -- `[^1]:` over `x` is a definition and a separate
      // paragraph, where `[^1]: ` over `x` is one definition. The arbiter agrees on
      // both, so this is `remark-footnotes@2`'s own boundary rather than an
      // inference from rendered output, and it is why the docstring's examples all
      // carry that trailing space.
      const firstLine = source.slice(
        definitionStart,
        definitionEnd === definitionStart
          ? definitionEnd
          : (source.indexOf("\n", definitionStart) + 1 || definitionEnd + 1) -
              1,
      );
      if (BARE_COLON.test(firstLine)) continue;

      definition.children.push(block as never);
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
