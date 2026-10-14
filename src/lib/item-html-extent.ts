import type { Html, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface ParentNode extends Node {
  children: RootContent[];
}

/** An html opener with no closer on its own line. */
const UNCLOSED_COMMENT = /^<!--(?!.*-->)/su;

/** Every container whose own html can grow over a lazy line below it. */
const HOSTS = new Set(["listItem", "blockquote", "callout"]);

/**
 * An unclosed html block inside a list item swallows the line below it.
 *
 * micromark ends the block at the item's boundary, so a following line at column zero
 * becomes a lazy paragraph continuation of the item and anything in it is indexed.
 * Obsidian keeps reading the html, so nothing on that line is indexed at all.
 *
 * Measured over the referee corpus, counting list items whose content opens an html block
 * with the next line holding a `[^`:
 *
 *     <!--        58 lines, Obsidian indexes NOTHING on 58 of them
 *     block tag   29 lines, Obsidian indexes nothing on 27
 *
 * The comment opener was unanimous and the block tag had two counter-examples, so for a while
 * only the comment was folded here. SCORED since, which is the evidence that count was waiting
 * for, and both widenings are net positive:
 *
 *     block tag, list items only          better  8  worse 0
 *     any html, any container             better 10  worse 1
 *
 * So the host set is `listItem`, `blockquote` and `callout`, which is what their B4 states for
 * all three at once. A CLOSED one-line comment is the single shape that does NOT run on, since
 * `<!-- x -->` ends where it is written.
 *
 * At ROOT micromark already does this -- `<div>` over `Text[^2]` is one `html@0-1` with no
 * reference in it at all -- so this is the container case of a rule the tokenizer applies
 * everywhere else, which is the shape that lands here rather than the shape that gets refused.
 *
 * This is the mirror of the rule `containerLazyTransform` already carries -- an html line
 * is absorbed *after* a list -- and it belongs to a separate pass because the direction is
 * reversed: there a sibling joins the container, here the container's own html grows over
 * a sibling.
 */
export function itemHtmlExtentTransform(tree: Root, source: string): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    if (!HOSTS.has(node.type)) return;
    const item = node as Partial<ParentNode>;
    if (!Array.isArray(item.children)) return;

    for (let index = item.children.length - 2; index >= 0; index--) {
      const html = item.children[index];
      const next = item.children[index + 1];
      if (html?.type !== "html" || next?.type !== "paragraph") continue;
      // A CLOSED comment on one line is the only html that does not run on: `<!-- x -->`
      // ends where it is written, so the line below it is genuinely its own paragraph. Every
      // other shape -- an unclosed `<!--`, or any block tag -- continues to a blank line,
      // which is their B4 for every container: "Fences, `$$` blocks, and HTML blocks inside
      // items and quotes run on through column-0 lines."
      if (html.value.startsWith("<!--") && !UNCLOSED_COMMENT.test(html.value)) {
        continue;
      }

      const from = html.position?.end?.offset;
      const to = next.position?.end?.offset;
      if (from === undefined || to === undefined) continue;
      // Directly below, with nothing but the one line ending between them. A blank line
      // closes the block in both readings, so it is left alone.
      const gap = source.slice(from, next.position!.start.offset!);
      if (!/^\n[ \t]*$/u.test(gap)) continue;

      (html as Html).value = source.slice(html.position!.start.offset!, to);
      html.position!.end = { ...next.position!.end };
      item.children.splice(index + 1, 1);
    }
  });
}
