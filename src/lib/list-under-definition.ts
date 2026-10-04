import type { FootnoteDefinition, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/**
 * An ordered list that cannot interrupt a paragraph cannot end a definition.
 *
 * CommonMark only lets an ordered list interrupt a paragraph when it starts at
 * `1.`, so `[^1]: body` followed by `2. item text` is lazy continuation of the
 * definition rather than a list beside it. micromark applies the rule to
 * ordinary paragraphs but still closes a footnote definition at the marker, and
 * the difference is visible: a definition's body renders in the footnote list,
 * while a list beside it renders inline.
 */
export function listUnderDefinitionTransform(tree: Root, source: string): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length - 1; index++) {
      const definition = parent.children[index];
      if (definition?.type !== "footnoteDefinition") continue;

      const list = parent.children[index + 1];
      if (list?.type !== "list" || !list.ordered) continue;
      if (list.start === null || list.start === undefined) continue;
      if (list.start === 1) continue;

      const from = definition.position?.end?.offset;
      const to = list.position?.start?.offset;
      if (from === undefined || to === undefined) continue;
      if (source.slice(from, to) !== "\n") continue;

      (definition as FootnoteDefinition).children.push(list as never);
      if (definition.position && list.position?.end) {
        definition.position.end = { ...list.position.end };
      }
      parent.children.splice(index + 1, 1);
      index--;
    }
  });
}
