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
 *
 * **And that gate only sees the FINAL tree, so a pass reading `point.column` mid-pipeline
 * is unprotected.** `definitionColumnTransform` compared its computed column against
 * `start.column` on a node an earlier pass had moved by offset alone -- column 2 against
 * offset 26 -- so it silently declined the case it existed for, and nothing caught it
 * because this pass repaired the point afterwards either way. The tell was an edit that
 * changed no output at all.
 *
 * So: a pass running before this one must read `offset` and derive the column itself.
 * Audited across `src/lib`, eight places read a `.column`:
 *
 * - `line-map.ts` derives an offset FROM a column, which is correct there and nowhere
 *   else -- `shiftByMap` places a freshly parsed fragment, whose line and column are
 *   authoritative and whose offset is an index into the fragment string.
 * - `callout.ts` and `task-char.ts` only increment, so they inherit whatever drift exists
 *   rather than acting on it.
 * - The remaining five were instrumented over the whole corpus, counting how often the
 *   point they read carries a column that disagrees with its own offset:
 *
 *       comment-tail             15 agree,    0 stale
 *       list-deep-continuation    1 agree,    0 stale
 *       math-fence               78 agree,    0 stale
 *       footnote-bare           984 agree,   21 STALE
 *       setext-underline         74 agree,    1 STALE
 *
 *   `footnote-bare` is stale 21 times and HARMLESS, which is the distinction that
 *   matters: it writes `offset` independently of the column, so this pass rebuilds the
 *   column correctly afterwards and nothing downstream ever sees the bad value.
 *
 *   `setext-underline` was the real one, at a single occurrence. Its column is not a
 *   point it writes but a DECISION -- how much of a setext underline counts as the
 *   container's own indent -- and a decision cannot be repaired after the fact. Fixed to
 *   derive from the offset.
 *
 *   So the rule is sharper than "read the offset": a stale column read into a point is
 *   repaired here, while one read into a branch is not. Frequency is the wrong sort by a
 *   long way -- the pass that was stale 21 times needed no change and the pass that was
 *   stale once did.
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
  let line = 1;
  let bol = 0;
  for (let index = 0; index < offset; index++) {
    // A lone CR ends a line too, which splitting on `\n` cannot see -- see
    // `normalizePointsTransform` below for what that cost.
    if (source[index] === "\r" && source[index + 1] === "\n") continue;
    if (source[index] !== "\n" && source[index] !== "\r") continue;
    line += 1;
    bol = index + 1;
  }
  return { line, column: offset - bol + 1, offset };
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

  // CommonMark ends a line on `\r\n`, `\n` OR a lone `\r`, and indexing only `\n` made
  // this pass CORRUPT the positions it exists to repair. `a\rb\r` is two lines to Obsidian
  // and to micromark, which gets the paragraph right; this pass then rebuilt every point
  // against a one-line index and reported `0:0-0:3` for what is `0:0-1:1`. A lone CR is
  // rare enough that it hid behind a single probe, and the failure mode is the worst kind
  // -- a wrong offset rather than a missing one, written over a correct one.
  const starts = [0];
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === "\r" && source[index + 1] === "\n") continue;
    if (character === "\n" || character === "\r") starts.push(index + 1);
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
