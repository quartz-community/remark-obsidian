import type { Html, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import type { Comment } from "./types.js";

const OPENS_BLOCK = /\n\[\^[^\]\n]*\]:/u;
const BLANK_LINE = /\n[ \t]*\n/u;
const SHIELDS = new Set(["inlineCode", "code"]);

interface Point {
  line: number;
  column: number;
  offset?: number;
}

export interface Region {
  readonly start: number;
  readonly end: number;
  readonly closed: boolean;
}

/**
 * Pair comment markers over the raw source.
 *
 * Obsidian pairs `%%` lexically: the first opens, the next closes, and block
 * structure has no say. Ours is a micromark construct, so a container can
 * swallow an opener as ordinary content — a definition's indented `    %%`
 * becomes part of the definition — and then the *closer* is read as the next
 * opener. Every marker after that is paired one position out.
 *
 * No transform over the resulting tree can repair that, because the tree no
 * longer records where the regions were. Recomputing them from source does.
 */
function regionsFor(source: string, open: string, close: string): Region[] {
  const found: Region[] = [];
  let from = 0;

  while (from < source.length) {
    const at = source.indexOf(open, from);
    if (at === -1) break;

    const shut = source.indexOf(close, at + open.length);
    if (shut === -1) {
      found.push({ start: at, end: source.length, closed: false });
      break;
    }
    found.push({ start: at, end: shut + close.length, closed: true });

    // Scanning resumes on the next line, not straight after the closer. A
    // comment that ends mid-line leaves the rest of that line as a block, and
    // a marker inside it is literal — `%%⏎line %% nested %% line⏎%%` closes on
    // the second marker, keeps ` nested %% line` as prose, and opens again
    // only on the following line.
    const newline = source.indexOf("\n", shut + close.length);
    if (newline === -1) break;
    from = newline + 1;
  }

  return found;
}

export function commentRegions(source: string): Region[] {
  return regionsFor(source, "%%", "%%");
}

/**
 * `<!--` is **not** paired the way `%%` is, and assuming otherwise is wrong in
 * two measured ways. `%%` is Obsidian's own construct; `<!--` is a CommonMark
 * HTML block, so it answers to block structure that `%%` ignores:
 *
 * - it does not pair across a blank line, so `x <!--` / blank / `hidden` /
 *   blank / `--> after` is not a comment;
 * - an opener inside a link or footnote label is literal, so neither
 *   `see[^a<!--x-->b].` nor `body [^c<!--d] … ⏎--> end` is one either.
 */
export function htmlCommentRegions(source: string): Region[] {
  return regionsFor(source, "<!--", "-->").filter(
    (region) =>
      !BLANK_LINE.test(source.slice(region.start, region.end)) &&
      !insideLabel(source, region.start),
  );
}

/** Whether an unclosed `[` sits before `at` on the same line. */
function insideLabel(source: string, at: number): boolean {
  let depth = 0;
  for (let index = at - 1; index >= 0; index--) {
    const character = source[index];
    if (character === "\n") break;
    if (character === "]") depth++;
    else if (character === "[") {
      if (depth === 0) return true;
      depth--;
    }
  }
  return false;
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

interface Shape {
  readonly regions: Region[];
  /** True when the tree already represents this region correctly. */
  readonly settled: (region: Region) => boolean;
  readonly build: (start: number, end: number) => RootContent;
}

/**
 * Rebuild the document around a region whose opener a container swallowed.
 *
 * The block holding the opener keeps the text before it, takes the whole region
 * as a hidden child and ends where the region ends — which is what makes
 * Obsidian report one section spanning both. Everything after the region is
 * re-parsed, since the mis-pairing had consumed it into a bogus block.
 */
export function commentRegionTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  const commentStarts = new Set<number>();
  const spans = new Set<string>();
  const shielded: Array<[number, number]> = [];

  visit(tree, (node: Node) => {
    const from = node.position?.start?.offset;
    const to = node.position?.end?.offset;
    if (from === undefined || to === undefined) return;
    spans.add(`${from}:${to}`);
    if (SHIELDS.has(node.type)) shielded.push([from, to]);
    if (node.type === "comment") commentStarts.add(from);
  });

  const isShielded = (at: number): boolean =>
    shielded.some(([from, to]) => at >= from && at < to);

  const shapes: Shape[] = [
    {
      regions: commentRegions(source),
      // A comment already spanning the region exactly is correct. The
      // mis-pairing shows up as a comment that touches the region — at its
      // start or at its closer — but does not cover it. Requiring that contact
      // keeps a `%%` shielded by a code span or fence, where no comment node
      // exists at all, from being rewritten into one.
      settled: ({ start, end }) =>
        spans.has(`${start}:${end}`) ||
        (!commentStarts.has(start) && !commentStarts.has(end - 2)),
      build: (start, end) => buildComment(source, start, end),
    },
    {
      regions: htmlCommentRegions(source),
      // A swallowed `<!--` still produces an `html` node, but only for the
      // four-character opener, so "a node starts here" means nothing. What
      // counts is whether one *covers* the region.
      settled: ({ start, end }) =>
        spans.has(`${start}:${end}`) || isShielded(start),
      build: (start, end) => buildHtml(source, start, end),
    },
  ];

  for (const shape of shapes) {
    for (const region of shape.regions) {
      // An unclosed region does not run to the end of the note swallowing
      // later blocks: `> %%` alone leaves a definition further down alive.
      if (!region.closed) continue;
      // Nor does one swallow a line that opens a block of its own. In
      // `[^9]: orphan` / `    %%` / `[^1]: one` / `%%` Obsidian reports two
      // definitions and no comment, where the same shape over plain prose is
      // one definition holding the whole region.
      if (OPENS_BLOCK.test(source.slice(region.start, region.end))) continue;
      if (shape.settled(region)) continue;
      if (rebuild(tree, source, reparse, region, shape.build)) return;
    }
  }
}

function buildComment(source: string, start: number, end: number): RootContent {
  const comment: Comment = {
    type: "comment",
    value: source.slice(start + 2, Math.max(start + 2, end - 2)),
    position: {
      start: { line: lineAt(source, start), column: 1, offset: start },
      end: { line: lineAt(source, end), column: 1, offset: end },
    },
  };
  return comment as unknown as RootContent;
}

function buildHtml(source: string, start: number, end: number): RootContent {
  const html: Html = {
    type: "html",
    value: source.slice(start, end),
    position: {
      start: { line: lineAt(source, start), column: 1, offset: start },
      end: { line: lineAt(source, end), column: 1, offset: end },
    },
  };
  return html;
}

function rebuild(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
  { start, end }: Region,
  build: (start: number, end: number) => RootContent,
): boolean {
  const children = tree.children;

  const host = children.findIndex((node) => {
    const from = node.position?.start?.offset;
    const to = node.position?.end?.offset;
    return from !== undefined && to !== undefined && from < start && to > start;
  });
  if (host === -1) return false;

  const from = children[host]!.position!.start!.offset!;
  const before = reparse(source.slice(from, start));
  if (before.children.length === 0) return false;

  for (const node of before.children)
    shift(node, from, lineAt(source, from) - 1);

  const hidden = build(start, end);
  const owner = before.children[before.children.length - 1] as RootContent & {
    children?: RootContent[];
  };
  if (Array.isArray(owner.children)) {
    owner.children.push(hidden as never);
    if (owner.position) owner.position.end = { ...hidden.position!.end };
  } else {
    before.children.push(hidden);
  }

  const after = reparse(source.slice(end));
  for (const node of after.children) shift(node, end, lineAt(source, end) - 1);

  // Everything from the host onward is replaced, not just what overlaps the
  // region: `after` re-parses the whole remainder, so leaving the original
  // trailing blocks in place duplicates them.
  children.splice(
    host,
    children.length - host,
    ...(before.children as RootContent[]),
    ...(after.children as RootContent[]),
  );
  return true;
}
