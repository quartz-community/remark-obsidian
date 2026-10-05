import type { Heading, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/** A bare run, as `remark-parse@8` requires: no indent, no trailing space. */
const UNDERLINE = /^(=+|-+)$/u;

const CONTAINERS = new Set(["blockquote", "callout", "list", "listItem"]);

/**
 * A column-zero underline makes a heading of the container line above it.
 *
 * At root, `para` over `===` is a setext heading and always was. Inside a
 * container it is not: the underline sits outside the container's own prefix,
 * so it arrives as lazy continuation and the run becomes ordinary text —
 * `- $x` over `===` rendered as the text `$x ===` where Obsidian reports one
 * list holding a heading named `$x`, with the underline consumed.
 *
 * Measured across fifty-odd fuzz-reduced cases, all the same shape: a list
 * item or a quote, one content line, then `===` or `---` at column zero. The
 * heading stays inside the container, which is why this rebuilds the
 * paragraph in place rather than lifting anything out.
 *
 * Deliberately limited to a two-line paragraph. A longer one does not fold
 * the same way — `-  *em*` / `<br>` / `](u)` / `---` reports no heading at all
 * in Obsidian — so widening this without cases for it would be guessing.
 */
export function containerSetextTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    if (!CONTAINERS.has(node.type)) return;
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const paragraph = parent.children[index];
      if (paragraph?.type !== "paragraph") continue;

      const from = paragraph.position?.start?.offset;
      const to = paragraph.position?.end?.offset;
      const fromLine = paragraph.position?.start?.line;
      if (from === undefined || to === undefined) continue;
      if (fromLine === undefined) continue;

      const lines = source.slice(from, to).split("\n");
      if (lines.length !== 2) continue;
      const [content, underline] = lines as [string, string];
      if (!UNDERLINE.test(underline) || content.trim() === "") continue;

      const inline = reparse(content).children[0];
      const heading: Heading = {
        type: "heading",
        depth: underline.startsWith("=") ? 1 : 2,
        children: inline?.type === "paragraph" ? inline.children : [],
        position: {
          start: { ...paragraph.position!.start },
          end: { ...paragraph.position!.end },
        },
      };
      parent.children.splice(index, 1, heading);
    }
  });
}
