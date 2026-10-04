import type { FootnoteDefinition, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/** A blank line, or a blank line inside a quote. */
const BLANK = /^\n(?:[ \t]*>[ \t]*)?\n?$/u;

/**
 * A tab continues a footnote definition even where four columns do not.
 *
 * A definition's later blocks have to be indented, and inside a quote the
 * marker eats part of that budget: `>` then a tab lands short of four columns,
 * so CommonMark ends the definition and starts a sibling. Obsidian keeps
 * reading, and `remark-footnotes` agrees with it — measured on the legacy
 * stack, which puts the line inside the definition as a second paragraph.
 *
 * The difference is visible, not structural. A definition's body renders in
 * the footnote list at the end of the note, so a block left outside it appears
 * inline instead, as text Obsidian never shows there.
 */
export function definitionTabTransform(tree: Root, source: string): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length - 1; index++) {
      const definition = parent.children[index];
      if (definition?.type !== "footnoteDefinition") continue;

      const next = parent.children[index + 1];
      const end = definition.position?.end?.offset;
      const start = next?.position?.start?.offset;
      if (end === undefined || start === undefined) continue;
      if (!BLANK.test(source.slice(end, start))) continue;

      // Everything between the line start and the block is marker and
      // indentation; a tab at the end of it is what Obsidian counts.
      const lineStart = source.lastIndexOf("\n", start - 1) + 1;
      if (!/\t$/u.test(source.slice(lineStart, start))) continue;

      (definition as FootnoteDefinition).children.push(next as never);
      if (definition.position && next!.position?.end) {
        definition.position.end = { ...next!.position.end };
      }
      parent.children.splice(index + 1, 1);
      index--;
    }
  });
}
