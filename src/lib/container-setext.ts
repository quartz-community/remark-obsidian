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
/** Move a node and its descendants onto the document by a flat offset. */
function shiftOnto(node: unknown, offset: number): void {
  const candidate = node as {
    position?: {
      start: { offset?: number };
      end: { offset?: number };
    };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.offset = offset + (point.offset ?? 0);
    }
  }
  for (const child of candidate.children ?? []) shiftOnto(child, offset);
}

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

      // The children's start, not the paragraph's own. A task item's paragraph
      // spans from before its checkbox while its children correctly begin after
      // it -- `- [ ] ~~del~~` over `===` reports `paragraph@2-17` with its first
      // child at 6 -- so slicing by the span put `[ ] ` in the heading's text
      // where Obsidian shows `del` and counts the checkbox as the task marker.
      //
      // `setext-underline.ts` records the same preference for the same reason.
      const span = paragraph.position?.start?.offset;
      const from = paragraph.children[0]?.position?.start?.offset ?? span;
      const to = paragraph.position?.end?.offset;
      const fromLine =
        paragraph.children[0]?.position?.start?.line ??
        paragraph.position?.start?.line;
      if (from === undefined || to === undefined) continue;
      if (fromLine === undefined) continue;

      const lines = source.slice(from, to).split("\n");
      // The underline has to be the *second* line, but anything after it is fine:
      // `- item` / `===` / `more` is a heading plus `more` to Obsidian, while
      // `-  *em*` / `<br>` / `](u)` / `---` -- where the run is on the fourth line --
      // reports no heading at all. Capping the whole paragraph at two lines conflated
      // the two.
      if (lines.length < 2) continue;
      const [content, underline] = lines as [string, string];
      if (!UNDERLINE.test(underline) || content.trim() === "") continue;
      const tail = lines.slice(2);

      const inline = reparse(content).children[0];
      // Placed onto the document. `reparse` numbers the fragment from its own
      // start, and leaving that alone is worse than it looks: `contentStart` in
      // `setext-underline.ts` deliberately trusts a heading's children over its own
      // span, so an unshifted child reported offset 0, that pass then read the whole
      // document as the heading's content, counted three lines and demoted the
      // heading it had just been handed. `- a` / `- b` / `===` lost its heading and
      // came back as a paragraph spanning the entire source.
      if (inline?.type === "paragraph") {
        for (const child of inline.children) shiftOnto(child, from);
      }
      // The heading's own start follows its content too, because `headingName`
      // reads the source over this span: left at the paragraph's start it named
      // `- [ ] ~~del~~` over `===` as `[ ] ~~del~~`, checkbox included, after the
      // children had already been corrected.
      const contentPoint =
        paragraph.children[0]?.position?.start ?? paragraph.position!.start;
      const heading: Heading = {
        type: "heading",
        depth: underline.startsWith("=") ? 1 : 2,
        children: inline?.type === "paragraph" ? inline.children : [],
        position: {
          start: { ...contentPoint },
          end: { ...paragraph.position!.end },
        },
      };
      if (tail.length === 0) {
        parent.children.splice(index, 1, heading);
        continue;
      }

      // The lines below the underline are their own block, re-parsed from where
      // they actually start so the heading does not claim them.
      const tailFrom = from + content.length + 1 + underline.length + 1;
      heading.position = {
        start: { ...contentPoint },
        end: { line: 0, column: 1, offset: tailFrom - 1 },
      };
      const rest = reparse(tail.join("\n")).children[0];
      if (rest?.type !== "paragraph") {
        parent.children.splice(index, 1, heading);
        continue;
      }
      for (const child of rest.children) shiftOnto(child, tailFrom);
      rest.position = {
        start: { line: 0, column: 1, offset: tailFrom },
        end: { ...paragraph.position!.end },
      };
      parent.children.splice(index, 1, heading, rest);
      index++;
    }
  });
}
