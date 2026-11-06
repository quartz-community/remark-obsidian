import type { Root } from "mdast";
import type { Point } from "unist";
import { visit } from "unist-util-visit";

/**
 * Count a leading byte order mark that was read past without being counted, so every offset
 * indexes the string the caller passed. Only the first line's columns move, and the root keeps
 * its start, since it is the whole string, as remark-parse 8 places it.
 *
 * Points are moved by identity. A tree can hold one point object in two places (an empty callout
 * title and the block on its line), and moving it once per holder lands it past the mark's width.
 */
export function countByteOrderMark(tree: Root): void {
  const moved = new Set<Point>();
  const move = (point: Point): void => {
    if (moved.has(point)) return;
    moved.add(point);
    if (point.offset !== undefined) point.offset += 1;
    if (point.line === 1) point.column += 1;
  };
  if (tree.position) {
    tree.position = {
      start: { ...tree.position.start },
      end: { ...tree.position.end },
    };
    move(tree.position.end);
  }
  visit(tree, (node) => {
    if (node === tree || !node.position) return;
    move(node.position.start);
    move(node.position.end);
  });
  // The mark stands in front of what the first line's containers took. A line none took stays
  // absent: the mark is no container.
  const offsets = tree.data?.lineOffsets as Record<number, number> | undefined;
  if (offsets?.[1] !== undefined) offsets[1] += 1;
}
