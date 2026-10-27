import type { Root, RootContent } from "mdast";
import type { Node } from "unist";

const MARKER = "%%";

interface ParentNode extends Node {
  children: RootContent[];
}

interface CommentNode extends Node {
  type: "comment";
  value: string;
  children?: RootContent[];
}

const isComment = (node: unknown): node is CommentNode =>
  (node as { type?: string } | undefined)?.type === "comment";

/**
 * A line that cannot lazily continue a paragraph, so it ends the container above it.
 *
 * CommonMark, and measured directly: `> > %%` over `- item`, `# head` or a fence reports
 * `blockquote@0-0` plus a separate root section, while `plain` and `[^note]: def` keep the
 * quote open.
 */
const ENDS_CONTAINER =
  /^ {0,3}(?:#{1,6}(?:[ \t]|$)|```|~~~|[-*+][ \t]|\d{1,9}[.)][ \t])/u;

/**
 * An unclosed `%%` opened inside a quote at depth TWO OR MORE swallows the lines below it.
 *
 * `comment-quote-extent.ts` owns depth one and cannot reach this. It requires the comment NOT
 * to be the quote's last child, and at depth one that holds because remark's lazy continuation
 * pulls the root-level line into the quote, giving the comment a sibling. At depth two the line
 * stays at ROOT, the comment IS last, and that pass returns. Six probes against live 1.14.4:
 *
 *     > > %%  / [^note]: Definition        suppressed   ours: DEFINITION  <- this
 *     >   %%  / [^note]: Definition        suppressed   the depth-1 pass
 *         %%  / [^note]: Definition        suppressed   the root rule
 *     > > %%  / > > %%  / [^note]: Defn    SURVIVES     closed, so untouched
 *     > > %%  / blank   / [^note]: Defn    SURVIVES     the blank ends the quote
 *
 * THREE RESTRICTIONS, each derived from a construct rather than fitted to a loss, and the
 * scoring history is why each one is here:
 *
 *     to the first blank line, dropping defs AND refs      5 better   11 worse
 *     ...DEFINITIONS ONLY                                  6 better    1 worse
 *     ...and bounded by LAZY CONTINUATION                  6 better    0 worse
 *
 * The first eleven losses were REFERENCES. A `%%` comment defines nothing and its references
 * are still indexed -- the asymmetry worth 710 documents that `parseComments` already
 * implements -- so folding the swallowed blocks into the comment as CHILDREN is what gets both
 * halves right: a `footnoteDefinition` inside a comment stops defining and its label is
 * indexed at its own position, which is precisely what Obsidian reports.
 *
 * The last loss was one document and an ATX heading:
 *
 *     24  > > %%          the opener
 *     25  ## Footnotes    an ATX heading at column 0 -- the quote ENDS here
 *     26  [^x-y]: ...     survives, and a blank-line bound was burying it
 *     27  [^टिप्पणी]: ...  survives
 *     28  (blank)         where a blank-line scan would have stopped
 *
 * A comment opened inside a quote is bounded by the quote, and a quote ends wherever a
 * paragraph can no longer be lazily continued.
 */
export function quoteCommentLazyTransform(tree: Root, source: string): void {
  if (source === "") return;

  for (let index = tree.children.length - 1; index >= 0; index--) {
    const container = tree.children[index];
    if (container?.type !== "blockquote") continue;

    // The PATH down to the comment, because the blocks it swallows are not necessarily root
    // siblings. Lazy continuation has usually pulled them into the OUTER quote already, so
    // `> > %%` / `[^note]: Definition` arrives as `blockquote > [blockquote, definition]` --
    // the comment is the INNER quote's last child and the definition is its uncle. A root-only
    // lookup finds nothing and the first version of this pass fired on two documents instead
    // of six.
    const path = commentPath(container as unknown as ParentNode, [
      tree as unknown as ParentNode,
      container as unknown as ParentNode,
    ]);
    if (!path) continue;
    const { comment, chain } = path;
    // Depth ONE is `comment-quote-extent.ts`'s, measured and shipped. Claiming it here would
    // double-apply and its damage would say nothing about this rule.
    const depth = chain.filter(
      (node) => (node as Node).type === "blockquote",
    ).length;
    if (depth < 2) continue;

    const from = comment.position?.start?.offset;
    if (from === undefined) continue;
    const quoteEnd = container.position?.end?.offset ?? source.length;
    if (source.slice(from + MARKER.length, quoteEnd).includes(MARKER)) continue;

    const reach = containerBound(source, from);

    // Every following sibling on the ancestor chain, innermost first, which is document order
    // for the blocks below the opener.
    const swallowed: RootContent[] = [];
    for (let at = chain.length - 1; at >= 1; at--) {
      const parent = chain[at - 1]!;
      const child = chain[at]!;
      const seat = parent.children.indexOf(child as unknown as RootContent);
      if (seat === -1) continue;
      let last = seat;
      while (last + 1 < parent.children.length) {
        const next = parent.children[last + 1];
        const start = next?.position?.start?.offset;
        if (start === undefined || start >= reach) break;
        last += 1;
      }
      if (last === seat) continue;
      swallowed.push(...parent.children.slice(seat + 1, last + 1));
      parent.children.splice(seat + 1, last - seat);
    }
    if (swallowed.length === 0) continue;

    comment.value = source.slice(from + MARKER.length, reach);
    if (comment.position) comment.position.end = pointOf(source, reach);
    comment.children = swallowed;

    // EVERY ANCESTOR ON THE PATH, or the comment ends after the quote that holds it and
    // `invariants.test.ts` reports `child ENDS AFTER parent: blockquote > comment`. This
    // repo's standing rule: the descent is the unit of work, so a span is not corrected until
    // every ancestor's is. The root is skipped -- its span is the whole document already.
    for (const ancestor of chain.slice(1)) {
      const node = ancestor as unknown as {
        position?: { end: { line: number; column: number; offset?: number } };
      };
      if (!node.position) continue;
      if ((node.position.end.offset ?? 0) >= reach) continue;
      node.position.end = pointOf(source, reach);
    }
  }
}

/** The comment that is its parent's LAST child, with the ancestor chain down to it. */
function commentPath(
  parent: ParentNode,
  chain: ParentNode[],
): { comment: CommentNode; chain: ParentNode[] } | undefined {
  const tail = parent.children[parent.children.length - 1];
  if (isComment(tail)) return { comment: tail, chain };
  // A quote whose own tail is not the comment may still HOLD it one level down, which is the
  // usual shape once a lazy block has been absorbed beside the inner quote.
  for (const child of parent.children) {
    if (child.type !== "blockquote") continue;
    const found = commentPath(child as unknown as ParentNode, [
      ...chain,
      child as unknown as ParentNode,
    ]);
    if (found) return found;
  }
  return undefined;
}

/**
 * Where the container holding the opener ends: the first line below it that cannot lazily
 * continue a paragraph, or the end of the source.
 */
function containerBound(source: string, from: number): number {
  let at = source.indexOf("\n", from);
  if (at === -1) return source.length;
  at += 1;
  while (at < source.length) {
    const nl = source.indexOf("\n", at);
    const end = nl === -1 ? source.length : nl;
    const line = source.slice(at, end);
    if (line.trim() === "" || ENDS_CONTAINER.test(line)) return at - 1;
    if (nl === -1) return source.length;
    at = nl + 1;
  }
  return trimmed(source, from);
}

/**
 * The end of the last content character, never a trailing line ending.
 *
 * `> > %%` / `em*` is `blockquote@0:0-1:3` to Obsidian -- it ends ON `em*`, not on the newline
 * after it. Returning `source.length` extended the quote a line too far and
 * `probe/nested-comment/two-deep-then-lazy` reported a second `sections` divergence, which the
 * corpus delta gate cannot see because it reads the main projections rather than the `compute`
 * oracle.
 */
function trimmed(source: string, from: number): number {
  let end = source.length;
  while (end > from && (source[end - 1] === "\n" || source[end - 1] === "\r")) {
    end -= 1;
  }
  return end;
}

function pointOf(
  source: string,
  offset: number,
): { line: number; column: number; offset: number } {
  const before = source.slice(0, offset);
  const line = before.split("\n").length;
  return {
    line,
    column: offset - (before.lastIndexOf("\n") + 1) + 1,
    offset,
  };
}
