import type { Paragraph, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import { mapLines } from "./line-map.js";

/** `math` comes from `mdast-util-math`, which `mdast` itself does not declare. */
interface MathNode {
  value: string;
}

const CONTAINERS = new Set(["blockquote", "listItem", "footnoteDefinition"]);

/**
 * Inside a container, a `$$` at the end of a line opens a display block.
 *
 * At the document level it does not: `tail $$` / `x` / `$$` reads as prose
 * followed by an empty formula, and we already agree with Obsidian there. One
 * level in, the same three lines are `tail ` followed by a block holding `x`.
 *
 * The rule was measured rather than inferred. Two recorded cases disagreed
 * about mid-line `$$`, and no reading of them separated "mid-line" from
 * "inside a quote" from "inside a definition", so the corpus now probes each
 * axis alone — `math/midline-plain` against `math/midline-quote` and
 * `math/midline-list` is what isolates the container as the deciding factor.
 *
 * micromark leaves the shape this works from: the trailing `$$` becomes an
 * empty `math` sibling and the opener stays as text in the paragraph. Moving
 * the split point is enough; nothing needs re-tokenizing.
 */
export function mathMidlineTransform(tree: Root, source: string): void {
  visit(tree, (node: Node) => {
    if (!CONTAINERS.has(node.type)) return;
    const parent = node as unknown as { children: RootContent[] };
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length - 1; index++) {
      const paragraph = parent.children[index];
      const math = parent.children[index + 1];
      if (paragraph?.type !== "paragraph" || math?.type !== "math") continue;
      if ((math as unknown as MathNode).value !== "") continue;

      const start = paragraph.position?.start?.offset;
      const end = paragraph.position?.end?.offset;
      const line = paragraph.position?.start?.line;
      const closeEnd = math.position?.end?.offset;
      if (start === undefined || end === undefined) continue;
      if (line === undefined || closeEnd === undefined) continue;

      const map = mapLines(source, start, end, line);
      const lines = map.text.split("\n");
      const opener = lines.findIndex((text) => text.endsWith("$$"));
      if (opener === -1) continue;

      // Absolute offset of the `$$` that opens the block.
      const openerStart =
        map.starts[opener]! + lines[opener]!.length - "$$".length;

      const kept = lines
        .slice(0, opener)
        .concat(lines[opener]!.slice(0, -"$$".length))
        .join("\n");
      const body = lines.slice(opener + 1).join("\n");

      (math as unknown as MathNode).value = body;
      if (math.position) {
        math.position.start = {
          line: map.lines[opener]!,
          column: 1,
          offset: openerStart,
        };
      }

      if (kept.trim() === "") {
        parent.children.splice(index, 1);
        return;
      }

      (paragraph as Paragraph).children = [
        { type: "text", value: kept, position: paragraph.position },
      ];
      if (paragraph.position) {
        paragraph.position.end = {
          line: map.lines[opener]!,
          column: 1,
          offset: openerStart,
        };
      }
      return;
    }
  });
}
