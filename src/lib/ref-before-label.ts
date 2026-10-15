import type { PhrasingContent, Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/**
 * A `[^name]` stays a footnote reference even when a `[` follows it.
 *
 * `a[^1][^2]` arrives as a `linkReference` with the identifier `^2` and the text `^1` -- a FULL
 * link reference that swallowed both pairs -- so both footnote references vanish. Obsidian reads
 * two. Measured against live 1.14.4:
 *
 *     a[^1][^2]        obs 1@0:1, 2@0:5      ours []
 *     a[^1][^2][^3]    obs 1, 2, 3           ours only 3@0:9
 *     a[^1][x]         obs 1@0:1             ours []
 *     a[text][^1]      obs []                ours []   <- already right, and must stay
 *     a[^1]]           obs 1@0:1             ours 1@0:1
 *
 * THE FOURTH ROW IS THE DISCRIMINATOR, and it is why this is not the `][^` gap these notes
 * already record under `KNOWN_REFERENCE_GAPS`. There the first pair is a link TEXT and the `[`
 * after it really does open a label, which we get right and must keep getting right. Here the
 * first pair is itself a footnote reference, and a footnote reference is not a link text. So the
 * span has to START with `[^`: requiring only that it CONTAIN one scores 93/12 against 91/4,
 * and every extra loss is an `a[text][^1]` turned into a reference it should not have.
 *
 * DEFINED names already work. `[^1]: d` / `[^2]: d` / blank / `x[^1][^2]` reports both, because
 * GFM builds the references itself when the names resolve. This is the bare half, where
 * `bareFootnoteRefTransform` finds no plain text left to scan -- only a `linkReference` that
 * swallowed the pair.
 *
 * Scored better 91 / worse 4 before being built, over the 374 of 6,818 referee documents that
 * hold `][^`.
 */
export function refBeforeLabelTransform(tree: Root, source: string): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: PhrasingContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = parent.children.length - 1; index >= 0; index--) {
      const child = parent.children[index];
      if (child?.type !== "linkReference") continue;
      const from = child.position?.start?.offset;
      const to = child.position?.end?.offset;
      const line = child.position?.start?.line;
      const column = child.position?.start?.column;
      if (from === undefined || to === undefined) continue;
      if (line === undefined || column === undefined) continue;

      const span = source.slice(from, to);
      if (!span.startsWith("[^")) continue;

      const pieces: PhrasingContent[] = [];
      let at = 0;
      let text = "";
      const flush = (end: number): void => {
        if (text === "") return;
        pieces.push({
          type: "text",
          value: text,
          position: {
            start: {
              line,
              column: column + end - text.length,
              offset: from + end - text.length,
            },
            end: { line, column: column + end, offset: from + end },
          },
        });
        text = "";
      };
      while (at < span.length) {
        if (span[at] === "[" && span[at + 1] === "^") {
          const close = span.indexOf("]", at + 2);
          const name = close === -1 ? "" : span.slice(at + 2, close);
          if (close !== -1 && name !== "" && !/[ \t]/u.test(name)) {
            flush(at);
            pieces.push({
              type: "footnoteReference",
              identifier: name.toLowerCase(),
              label: name,
              position: {
                start: { line, column: column + at, offset: from + at },
                end: {
                  line,
                  column: column + close + 1,
                  offset: from + close + 1,
                },
              },
            });
            at = close + 1;
            continue;
          }
        }
        text += span[at];
        at += 1;
      }
      flush(at);
      if (pieces.length === 0) continue;
      // Nothing to do unless a reference actually came out of it.
      if (!pieces.some((piece) => piece.type === "footnoteReference")) continue;

      parent.children.splice(index, 1, ...pieces);
    }
  });
}
