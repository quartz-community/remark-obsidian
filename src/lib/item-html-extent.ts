import type { Html, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface ParentNode extends Node {
  children: RootContent[];
}

/** An html opener with no closer on its own line. */
const UNCLOSED_COMMENT = /^<!--(?!.*-->)/su;

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
 * The comment opener is unanimous, which is why only it is folded here. A bare block tag
 * has two counter-examples and wants its own evidence before being treated the same way.
 *
 * This is the mirror of the rule `containerLazyTransform` already carries -- an html line
 * is absorbed *after* a list -- and it belongs to a separate pass because the direction is
 * reversed: there a sibling joins the container, here the container's own html grows over
 * a sibling.
 */
export function itemHtmlExtentTransform(tree: Root, source: string): void {
  if (source === "") return;

  visit(tree, "listItem", (node: Node) => {
    const item = node as Partial<ParentNode>;
    if (!Array.isArray(item.children)) return;

    for (let index = item.children.length - 2; index >= 0; index--) {
      const html = item.children[index];
      const next = item.children[index + 1];
      if (html?.type !== "html" || next?.type !== "paragraph") continue;
      // The comment opener only, per the measurement above: a bare block tag has two
      // counter-examples and wants its own evidence.
      if (!UNCLOSED_COMMENT.test(html.value)) continue;

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
