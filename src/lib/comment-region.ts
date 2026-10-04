import type { Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import type { Comment } from "./types.js";

const OPENS_BLOCK = /\n\[\^[^\]]*\]:/u;

interface Point {
  line: number;
  column: number;
  offset?: number;
}

/**
 * Pair `%%` markers over the raw source, which is how Obsidian reads them.
 *
 * Pairing is lexical there: the first `%%` opens, the next closes, and block
 * structure has no say. Ours is a micromark construct, so a container can
 * swallow an opener as ordinary content — a definition's indented `    %%`
 * becomes part of the definition — and then the *closer* is read as the next
 * opener. Every marker after that is paired one position out.
 *
 * No transform over the resulting tree can repair that, because the tree no
 * longer records where the regions were. Recomputing them from source does, and
 * it is cheap and exact.
 */
export interface Region {
  readonly start: number;
  readonly end: number;
  readonly closed: boolean;
}

export function commentRegions(source: string): Region[] {
  const found: Region[] = [];
  let from = 0;

  while (from < source.length) {
    const open = source.indexOf("%%", from);
    if (open === -1) break;

    const close = source.indexOf("%%", open + 2);
    if (close === -1) {
      found.push({ start: open, end: source.length, closed: false });
      break;
    }
    found.push({ start: open, end: close + 2, closed: true });

    // Scanning resumes on the next line, not straight after the closer. A
    // comment that ends mid-line leaves the rest of that line as a block, and
    // a `%%` inside it is literal — `%%⏎line %% nested %% line⏎%%` closes on
    // the second marker, keeps ` nested %% line` as prose, and opens again
    // only on the following line.
    const newline = source.indexOf("\n", close + 2);
    if (newline === -1) break;
    from = newline + 1;
  }

  return found;
}

function shift(node: unknown, offset: number, line: number): void {
  const candidate = node as {
    position?: { start: Point; end: Point };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.offset = offset + (point.offset ?? 0);
      point.line += line;
    }
  }
  for (const child of candidate.children ?? []) shift(child, offset, line);
}

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index++) {
    if (source[index] === "\n") line++;
  }
  return line;
}

/**
 * Rebuild the document around a `%%` region whose opener a container swallowed.
 *
 * The block holding the opener keeps the text before it, takes the whole region
 * as a `comment` child and ends where the region ends — which is what makes
 * Obsidian report one section spanning both. Everything after the region is
 * re-parsed, since the mis-pairing had consumed it into a bogus comment.
 */
export function commentRegionTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  const starts = new Set<number>();
  const spans = new Set<string>();
  visit(tree, "comment", (node: Node) => {
    const from = node.position?.start?.offset;
    const to = node.position?.end?.offset;
    if (from === undefined || to === undefined) return;
    starts.add(from);
    spans.add(`${from}:${to}`);
  });

  for (const { start, end, closed } of commentRegions(source)) {
    // An unclosed region does not run to the end of the note swallowing later
    // blocks: `> %%` alone leaves a definition further down alive.
    if (!closed) continue;
    // Nor does one swallow a line that opens a block of its own. In
    // `[^9]: orphan` / `    %%` / `[^1]: one` / `%%` Obsidian reports two
    // definitions and no comment, where the same shape over plain prose is one
    // definition holding the whole region.
    if (OPENS_BLOCK.test(source.slice(start, end))) continue;
    const children = tree.children;

    // A comment already spanning the region exactly is correct; leave it. The
    // mis-pairing shows up as a comment that touches the region — at its start
    // or at its closer — but does not cover it. Requiring that contact is what
    // keeps a `%%` shielded by a code span or fence, where no comment node
    // exists at all, from being rewritten into one.
    if (spans.has(`${start}:${end}`)) continue;
    if (!starts.has(start) && !starts.has(end - 2)) continue;

    const host = children.findIndex((node) => {
      const from = node.position?.start?.offset;
      const to = node.position?.end?.offset;
      return (
        from !== undefined && to !== undefined && from < start && to > start
      );
    });
    if (host === -1) continue;

    const from = children[host]!.position!.start!.offset!;
    const before = reparse(source.slice(from, start));
    if (before.children.length === 0) continue;

    for (const node of before.children)
      shift(node, from, lineAt(source, from) - 1);

    const comment: Comment = {
      type: "comment",
      value: source.slice(start + 2, Math.max(start + 2, end - 2)),
      position: {
        start: { line: lineAt(source, start), column: 1, offset: start },
        end: { line: lineAt(source, end), column: 1, offset: end },
      },
    };

    const owner = before.children[before.children.length - 1] as RootContent & {
      children?: RootContent[];
    };
    if (Array.isArray(owner.children)) {
      owner.children.push(comment as never);
      if (owner.position) owner.position.end = { ...comment.position!.end };
    } else {
      before.children.push(comment as never);
    }

    const after = reparse(source.slice(end));
    for (const node of after.children)
      shift(node, end, lineAt(source, end) - 1);

    let last = host;
    while (
      last + 1 < children.length &&
      (children[last + 1]!.position?.start?.offset ?? Infinity) < end
    ) {
      last++;
    }

    children.splice(
      host,
      last - host + 1,
      ...(before.children as RootContent[]),
      ...(after.children as RootContent[]),
    );
    return;
  }
}
