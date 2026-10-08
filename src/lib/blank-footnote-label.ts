import type { Paragraph, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface ParentNode extends Node {
  children: RootContent[];
}

/**
 * A footnote label of only whitespace defines nothing.
 *
 * `[^ ]: x` is two paragraphs to Obsidian, rendering `[^ ] [^ ]: x`, where
 * micromark's gfm-footnote builds a definition named `" "` and hides the body. The
 * asymmetry is upstream's: a *reference* `[^ ]` is already refused there -- it comes
 * back as a link reference -- so only the definition half accepts a label its own
 * reference will not match.
 *
 * `footnote-bare.ts` records the same exclusion from the other side: widening its
 * `REFERENCE` pattern to allow whitespace costs 11 cases, because a label may not
 * hold any. This makes the definition agree with that.
 *
 * The line returns as a paragraph of its own source rather than being dropped,
 * which is the governing rule here: the characters are still in the file.
 */
export function blankFootnoteLabelTransform(tree: Root, source: string): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;

    for (let index = parent.children.length - 1; index >= 0; index--) {
      const definition = parent.children[index]!;
      if (definition.type !== "footnoteDefinition") continue;
      const identifier = String(
        (definition as unknown as { identifier?: string }).identifier ?? "",
      );
      if (identifier !== "" && identifier.trim() !== "") continue;

      const from = definition.position?.start?.offset;
      const to = definition.position?.end?.offset;
      if (from === undefined || to === undefined) continue;

      const paragraph: Paragraph = {
        type: "paragraph",
        children: [
          {
            type: "text",
            value: source.slice(from, to),
            position: {
              start: { ...definition.position!.start },
              end: { ...definition.position!.end },
            },
          },
        ],
        position: {
          start: { ...definition.position!.start },
          end: { ...definition.position!.end },
        },
      };
      parent.children.splice(index, 1, paragraph);
    }
  });
}
