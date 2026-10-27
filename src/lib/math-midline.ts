import type { Paragraph, PhrasingContent, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import { mapLines } from "./line-map.js";
import { pointAt } from "./normalize-points.js";

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
      const block = parent.children[index];
      const math = parent.children[index + 1];
      if (math?.type !== "math") continue;
      if ((math as unknown as MathNode).value !== "") continue;

      // The opener can sit one level further in. A definition inside a quote
      // holds the paragraph while the empty `math` is the definition's
      // sibling, so the pair is not in one child list. Reaching through keeps
      // the block where Obsidian puts it: inside the definition, whose body is
      // not rendered unless something references it.
      const host =
        block?.type === "paragraph"
          ? block
          : (block as unknown as { children?: RootContent[] })?.children?.at(
              -1,
            );
      if (host?.type !== "paragraph") continue;
      const paragraph = host;
      const nested = block !== host;

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

      const kept = phrasingBefore(paragraph as Paragraph, openerStart, source);
      if (!kept) continue;
      const body = lines.slice(opener + 1).join("\n");

      (math as unknown as MathNode).value = body;
      if (math.position) {
        math.position.start = {
          line: map.lines[opener]!,
          column: 1,
          offset: openerStart,
        };
      }

      if (nested) {
        // Move the block inside, so it shares the definition's visibility.
        const inner = (block as unknown as { children: RootContent[] })
          .children;
        inner.push(math);
        parent.children.splice(index + 1, 1);
        if (block?.position && math.position?.end) {
          block.position.end = { ...math.position.end };
        }
      }

      if (
        kept.every((node) => node.type === "text" && node.value.trim() === "")
      ) {
        if (!nested) parent.children.splice(index, 1);
        else {
          const inner = (block as unknown as { children: RootContent[] })
            .children;
          inner.splice(inner.indexOf(paragraph), 1);
        }
        return;
      }

      (paragraph as Paragraph).children = kept;
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

/**
 * The paragraph's phrasing up to `at`, where the opening `$$` starts, every construct before it
 * kept. This pass used to rebuild the paragraph as one text node sliced from the source, which
 * flattened every construct before the `$$` -- code spans, emphasis, links, wikilinks, tags --
 * into its raw characters: under `* p ⟨code span⟩ end.` / `   2) $$` / `\t$$`, `remark-math`
 * keeps the code span and this pass lost it.
 *
 * The `$$` ends its line, so it ends a line inside a `text` node: that node is cut at the end of
 * the line holding it, found by counting line endings, since a text value drops the indentation
 * of each continuation line and so cannot be indexed by offset. `undefined` when the `$$` sits
 * anywhere else, and the pass then leaves the tree as micromark built it.
 */
function phrasingBefore(
  paragraph: Paragraph,
  at: number,
  source: string,
): PhrasingContent[] | undefined {
  const kept: PhrasingContent[] = [];
  for (const child of paragraph.children) {
    const start = child.position?.start?.offset;
    const end = child.position?.end?.offset;
    if (start === undefined || end === undefined) return undefined;
    if (end <= at) {
      kept.push(child);
      continue;
    }
    if (start >= at) break;
    if (child.type !== "text") return undefined;

    const line = source.slice(start, at).split(/\r\n|\r|\n/u).length - 1;
    const endings = [...child.value.matchAll(/\r\n|\r|\n/gu)];
    if (line > endings.length) return undefined;
    const previous = endings[line - 1];
    const lineStart = previous ? previous.index + previous[0].length : 0;
    const lineEnd = endings[line]?.index ?? child.value.length;
    if (lineEnd - lineStart < "$$".length) return undefined;
    if (child.value.slice(lineEnd - "$$".length, lineEnd) !== "$$") {
      return undefined;
    }
    const value = child.value.slice(0, lineEnd - "$$".length);
    if (value !== "") {
      kept.push({
        ...child,
        value,
        position: {
          start: { ...child.position!.start },
          end: pointAt(source, at),
        },
      });
    }
    break;
  }
  return kept;
}
