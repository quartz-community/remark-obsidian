import type { Root, RootContent } from "mdast";

import { mapLines, shiftByMap } from "./line-map.js";

/** A `<textarea>` opener, which micromark treats as raw text and Obsidian does not. */
const OPENER = /^<\/?textarea(?=[\s/>]|$)/iu;

/**
 * `<textarea>` is not a raw-text element to Obsidian, so it does not swallow blocks.
 *
 * micromark's `htmlRawNames` is `["pre","script","style","textarea"]`, which makes
 * `<textarea>` a type-1 html block running to its closing tag -- so
 * `<textarea>` / `` / `*foo*` / `` / `_bar_` / `` / `</textarea>` arrives as one node.
 * Obsidian's fork of `remark-parse@8` has only `{pre, script, style}`, so the opener is
 * an ordinary type-7 block that ends at the first blank line and the rest is markdown:
 * four sections, `html`, `paragraph`, `paragraph`, `html`, with the emphasis rendered.
 *
 * Repaired on the tree rather than in the tokenizer because the tag list is a shared
 * module export, so there is nothing to override -- and because only the raw-ness
 * differs. The type-7 boundary is the first blank line, which is all this needs to
 * know; the remainder is handed back to the parser.
 *
 * `pre`, `script` and `style` are untouched, and that matters: eleven of the twelve
 * recorded raw-tag cases use those three and all of them match, because Obsidian keeps
 * them raw too. Only `textarea` was added by CommonMark after Obsidian's fork.
 */
export function textareaNotRawTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  for (let index = tree.children.length - 1; index >= 0; index--) {
    const node = tree.children[index];
    if (node?.type !== "html") continue;
    if (!OPENER.test(node.value)) continue;

    const from = node.position?.start?.offset;
    const to = node.position?.end?.offset;
    const startLine = node.position?.start?.line;
    if (from === undefined || to === undefined) continue;
    if (startLine === undefined) continue;

    const lines = source.slice(from, to).split("\n");
    const blank = lines.findIndex((line, at) => at > 0 && line.trim() === "");
    if (blank === -1) continue;

    const head = lines.slice(0, blank).join("\n");
    const restFrom = from + head.length + 1;
    const map = mapLines(source, restFrom, to, startLine + blank);
    const parsed = reparse(map.text);
    for (const child of parsed.children) shiftByMap(child, map, 0);

    node.value = head;
    if (node.position) {
      node.position.end = {
        line: startLine + blank - 1,
        column: (lines[blank - 1]?.length ?? 0) + 1,
        offset: from + head.length,
      };
    }
    tree.children.splice(index + 1, 0, ...(parsed.children as RootContent[]));
  }
}
