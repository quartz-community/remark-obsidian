import type { Break, Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

const NEWLINE = /\r\n|\r|\n/gu;

/**
 * Offsets only, with line and column left for `normalizePointsTransform`.
 *
 * `span` from `normalize-points.ts` would be the natural helper and is the wrong one
 * here: it calls `pointAt`, which counts lines by slicing the source from zero, so
 * placing n nodes costs O(n × length). On a paragraph of twenty thousand
 * soft-wrapped lines that was the entire four-fold slowdown, not the splicing it
 * first looked like.
 */
const at = (offset: number) => ({ line: 1, column: 1, offset });

/**
 * Convert a soft line ending into a `break`, keeping every position.
 *
 * `remark-breaks` is four lines that throw positions away. It calls `newlineToBreak`,
 * which is `findAndReplace(tree, [/\r?\n|\r/g, replace])`, and `replace` returns a
 * bare `{type: "break"}` while `findAndReplace` rebuilds the text around it as
 * `{type: "text", value}` -- no position on any of the three. Across this corpus that
 * was 512 positionless breaks and 641 positionless text nodes, 97% of every unplaced
 * node here.
 *
 * Doing it first makes that a no-op rather than a conflict: a text value with no
 * newline left in it matches nothing, so `remark-breaks` finds nothing to replace and
 * the result is the same tree with positions intact. This package is ordered before
 * it in the chain, which is what makes that possible.
 *
 * A newline written as a character reference is the one case this declines. `&#10;`
 * puts a newline in the value with none in the source, so the counts stop
 * corresponding and the offsets would be guesses -- one document in 2811, left to
 * `remark-breaks` to handle as it always has.
 */
export function breakPositionsTransform(tree: Root, source: string): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    // Rebuilt in one pass rather than spliced per node, so a parent holding many
    // replacements stays linear.
    let changed = false;
    const rebuilt: RootContent[] = [];

    for (const child of parent.children) {
      const start = child?.position?.start?.offset;
      const end = child?.position?.end?.offset;
      const value = child?.type === "text" ? (child as Text).value : undefined;
      if (
        value === undefined ||
        start === undefined ||
        end === undefined ||
        (!value.includes("\n") && !value.includes("\r"))
      ) {
        rebuilt.push(child);
        continue;
      }

      // Newlines are located in the source, not in the value, so a `\r\n` counts
      // once and spans two characters.
      const found = [...source.slice(start, end).matchAll(NEWLINE)];
      const parts = value.split(NEWLINE);
      if (found.length === 0 || parts.length !== found.length + 1) {
        rebuilt.push(child);
        continue;
      }

      changed = true;
      let from = start;
      for (const [index, match] of found.entries()) {
        const boundary = start + match.index;
        // An empty piece either side of a break is noise the original never had.
        if (parts[index] !== "") {
          rebuilt.push({
            type: "text",
            value: parts[index]!,
            position: { start: at(from), end: at(boundary) },
          } as Text);
        }
        rebuilt.push({
          type: "break",
          position: {
            start: at(boundary),
            end: at(boundary + match[0].length),
          },
        } as Break);
        from = boundary + match[0].length;
      }

      const last = parts[parts.length - 1]!;
      if (last !== "") {
        rebuilt.push({
          type: "text",
          value: last,
          position: { start: at(from), end: at(end) },
        } as Text);
      }
    }

    if (changed) parent.children = rebuilt;
  });
}
