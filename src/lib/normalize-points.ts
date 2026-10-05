import type { Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/**
 * Make every point's line and column agree with its own offset.
 *
 * The passes above re-parse fragments, and a fragment parse numbers its lines
 * from one. Each caller then places the result back, and placing it back is
 * where the two halves of a point diverge: an offset is a single number that a
 * shift can simply add to, while a line and a column have to be recomputed
 * against the document. `inline-refold` is the clearest case -- it rewrites
 * both offsets and leaves `line` and `column` spelling the flattened copy --
 * but any pass that moves a fragment can drift the same way.
 *
 * Measured rather than assumed: across the saved `computeMetadataAsync`
 * answers, every footnote reference whose declared line disagreed with
 * Obsidian had an offset that derived Obsidian's own line and column exactly.
 * The offsets are what the passes maintain carefully, so they are taken as the
 * truth here and the rest of the point is rebuilt from them.
 *
 * Running last means a pass may move a node freely and only has to keep its
 * offsets honest, which is the invariant `test/parity/points.test.ts` gates.
 */
/**
 * One point, for a pass that splices a node and knows only its offset.
 *
 * Scans from the start of the document, so it suits the handful of nodes a
 * splice creates rather than a whole tree -- `normalizePointsTransform` indexes
 * the line starts once for that.
 */
export function pointAt(
  source: string,
  offset: number,
): { line: number; column: number; offset: number } {
  const before = source.slice(0, offset);
  return {
    line: before.split("\n").length,
    column: offset - (before.lastIndexOf("\n") + 1) + 1,
    offset,
  };
}

/**
 * Give a spliced node the span it covers.
 *
 * A node with no position is invisible to anything that edits by offset, and it
 * blinds the passes downstream too: the bare-reference pass reads a label's
 * written form out of the source through its host's span, so a positionless host
 * made it fall back to the folded identifier. Measured against the saved
 * `computeMetadataAsync` answers, positionless hosts were holding 1439
 * references that no consumer could place.
 *
 * Does nothing when either end is unknown, so a caller may pass what it has.
 */
export function span<T extends Node>(
  candidate: T,
  source: string,
  from: number | undefined,
  to: number | undefined,
): T {
  if (source !== "" && from !== undefined && to !== undefined) {
    candidate.position = {
      start: pointAt(source, from),
      end: pointAt(source, to),
    };
  }
  return candidate;
}

export function normalizePointsTransform(tree: Root, source: string): void {
  if (source === "") return;

  const starts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === "\n") starts.push(index + 1);
  }

  /** The index in `starts` of the line holding `offset`. */
  const lineAt = (offset: number): number => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle]! <= offset) low = middle;
      else high = middle - 1;
    }
    return low;
  };

  visit(tree, (node: Node) => {
    const position = node.position;
    if (!position) return;
    for (const point of [position.start, position.end]) {
      const offset = point.offset;
      // A point with no offset is left alone: there is nothing to derive from,
      // and inventing one would place a node somewhere it never claimed to be.
      if (offset === undefined || offset < 0 || offset > source.length) {
        continue;
      }
      const index = lineAt(offset);
      point.line = index + 1;
      point.column = offset - starts[index]! + 1;
    }
  });
}
