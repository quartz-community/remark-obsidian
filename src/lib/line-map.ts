const QUOTE_PREFIX = /^[ \t]*>[ \t]?/u;

export interface LineMap {
  /** The block's content with any container prefix removed, ready to re-parse. */
  readonly text: string;
  /** Absolute source offset where each line's content begins. */
  readonly starts: readonly number[];
  /** Absolute source line number of each line. */
  readonly lines: readonly number[];
}

/**
 * Strip a container's line prefixes and remember where each line really began.
 *
 * A block inside a quote has `> ` on every continuation line, so its source
 * slice cannot be matched against block patterns or re-parsed as-is. Removing
 * the prefixes fixes that but breaks positions: the fragment is shorter than
 * the source by a different amount on every line, so the usual
 * shift-by-a-constant is wrong the moment a block spans more than one.
 *
 * Keeping the per-line offsets alongside the text lets a fragment parsed from
 * it be placed back exactly, which is what makes a split inside a quote report
 * the same spans Obsidian does.
 */
export function mapLines(
  source: string,
  start: number,
  end: number,
  startLine: number,
): LineMap {
  const raw = source.slice(start, end).split("\n");
  const text: string[] = [];
  const starts: number[] = [];
  const lines: number[] = [];
  let offset = start;

  for (let index = 0; index < raw.length; index++) {
    const line = raw[index]!;
    // The first line starts where the node does, already past any marker.
    const prefix = index === 0 ? "" : (QUOTE_PREFIX.exec(line)?.[0] ?? "");
    starts.push(offset + prefix.length);
    lines.push(startLine + index);
    text.push(line.slice(prefix.length));
    offset += line.length + 1;
  }

  return { text: text.join("\n"), starts, lines };
}

interface Point {
  line: number;
  column: number;
  offset?: number;
}

/**
 * Place a fragment parsed from `map.text` back onto the document.
 *
 * `from` is the index in the map of the fragment's first line, so a tail parsed
 * after a split lands on the lines it actually came from.
 */
export function shiftByMap(node: unknown, map: LineMap, from: number): void {
  const candidate = node as {
    position?: { start: Point; end: Point };
    children?: unknown[];
  };

  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      const index = from + point.line - 1;
      const lineStart = map.starts[index];
      const line = map.lines[index];
      if (lineStart !== undefined && line !== undefined) {
        point.offset = lineStart + point.column - 1;
        point.line = line;
      }
    }
  }

  for (const child of candidate.children ?? []) shiftByMap(child, map, from);
}
