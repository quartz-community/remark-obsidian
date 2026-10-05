import type { Paragraph, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { mapLines, shiftByMap } from "./line-map.js";
import type { Comment } from "./types.js";

const MARKER = "%%";

/**
 * Containers whose children are blocks, so a comment sitting directly in one
 * stands alone and its body is block content.
 */
const BLOCK_PARENTS = new Set([
  "root",
  "blockquote",
  "callout",
  "listItem",
  "footnoteDefinition",
]);

/**
 * Parse a `%%` comment's body into real nodes beside its text.
 *
 * Obsidian indexes what a comment contains without rendering any of it, so a
 * footnote reference written inside one is live to `metadataCache` while the
 * document shows nothing. A consumer that has to act on such a reference --
 * Obsidian Linter placing an edit, or a footnotes plugin counting what is
 * defined -- cannot do it against one opaque string without re-implementing
 * the parser on the fragment, which is how the two sides drift apart.
 *
 * `value` is left exactly as it was: the serialiser writes from it, so
 * round-tripping is unaffected and this pass is additive.
 *
 * Positions come through `mapLines`/`shiftByMap` rather than a constant shift,
 * because inside a quote every line after the first carries a `> ` that is not
 * part of the body -- the fragment is shorter than the source by a different
 * amount on each line.
 */
export function commentParseTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  visit(tree, "comment", (node: Node, _index, parent) => {
    const comment = node as Comment;
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    const startLine = node.position?.start?.line;
    if (start === undefined || end === undefined || startLine === undefined) {
      return;
    }

    const raw = source.slice(start, end);
    if (!raw.startsWith(MARKER)) return;
    // An unclosed comment runs to the end of the document, so there is no
    // closing marker to exclude.
    const closed = raw.length > MARKER.length * 2 && raw.endsWith(MARKER);
    const from = start + MARKER.length;
    const to = closed ? end - MARKER.length : end;
    if (to <= from) return;

    const map = mapLines(source, from, to, startLine);
    const fragment = reparse(map.text);
    for (const child of fragment.children) shiftByMap(child, map, 0);

    // A comment inside a paragraph holds phrasing, not blocks. Parsing a
    // fragment always yields blocks, so a lone paragraph is unwrapped to sit
    // where the comment itself sits; anything else is left as parsed rather
    // than forced into a shape it does not have.
    const inline = !BLOCK_PARENTS.has((parent as Node | null)?.type ?? "root");
    const only = fragment.children[0];
    comment.children =
      inline && fragment.children.length === 1 && only?.type === "paragraph"
        ? ((only as Paragraph).children as RootContent[])
        : (fragment.children as RootContent[]);
  });
}
