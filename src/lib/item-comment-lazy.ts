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
 * A line that cannot lazily continue the item's paragraph, so it ends the host.
 *
 * The same set `quote-comment-lazy.ts` uses, and for the same reason: a `%%` opened inside a
 * container is bounded by that container, and a container ends wherever a paragraph can no
 * longer be lazily continued. Unbounded, this rule scores 26 worse; bounded this way, 8.
 */
const ENDS_ITEM =
  /^ {0,3}(?:#{1,6}(?:[ \t]|$)|```|~~~|[-*+][ \t]|\d{1,9}[.)][ \t])/u;

/**
 * An unclosed `%%` that is a LIST ITEM's own content swallows the blocks below it.
 *
 * `quote-comment-lazy.ts` ships this rule for a blockquote at depth two or more. The same
 * decision was open for a list item, and the mechanism map says it is the commonest coupled
 * shape in the whole backlog -- 56 documents carrying
 * `def-extra @ footnoteDefinition` together with `ref-miss @ footnoteDefinition`, which is one
 * swap and not two errors.
 *
 * Our tree puts the comment and the definition side by side inside the item:
 *
 *     1.⇥%% / ⟨2sp⟩[^3]: It
 *       list > listItem > [ comment@1:4-2:1, footnoteDefinition@2:3-2:11 ]
 *
 * Obsidian reports NO definition there and indexes the buried label as a REFERENCE at its own
 * line and column -- `defs []` and `refs [["3",1,2],["3",3,3]]`, probed live. That asymmetry is
 * already implemented: a definition inside a comment does not define, while a reference inside
 * one is still indexed, which 710 documents depend on. So absorbing the definition as the
 * comment's CHILD gets both halves at once, and nothing has to synthesise a reference node.
 *
 * SCORING BOTH HALVES IS WHAT MADE THIS WORTH BUILDING, and the first version proves the
 * point. Dropping only the definition scored `better 9 / worse 0` and moved agreement by ZERO,
 * because every one of those documents still carried the missing reference. A rule that
 * implements half of a swap can only ever score better-but-flat:
 *
 *     unclosed `%%` in a list item buries the defs below it   better 9  worse 26   -25
 *     ...bounded by LAZY CONTINUATION                         better 9  worse  8    -8
 *     ...and the `%%` AT the item's content column            better 9  worse  0   FLAT
 *     ...and the buried label indexed as a REFERENCE          better 8  worse  0    +6
 *
 * THE FIVE-SPACE CAP NEEDS NO CODE HERE, which is why this requires a `comment` node rather
 * than matching the source. Four spaces past the marker leaves the `%%` at the item's content
 * column and micromark gives a `comment`; five puts it four columns in and micromark gives
 * `code @1:3-1:9 value="%%"` instead. The threshold is already correct in the tokenizer -- the
 * rule "a `%%` indented four columns is CODE", worth +7 referee documents -- so asking for the
 * node is the same restriction expressed where the decision is actually made, instead of a
 * separator width re-encoded as a regex that could drift from it.
 */
export function itemCommentLazyTransform(tree: Root, source: string): void {
  if (source === "") return;
  absorb(tree as unknown as ParentNode, source, []);
}

/** Every `listItem` at any depth, because a nested item hosts this exactly as a root one does. */
function absorb(
  node: ParentNode,
  source: string,
  ancestors: readonly ParentNode[],
): void {
  const children = node.children;
  if (!Array.isArray(children)) return;

  if ((node as Node).type === "listItem") {
    swallow(node, source, ancestors);
  }
  for (const child of [...children]) {
    absorb(child as unknown as ParentNode, source, [...ancestors, node]);
  }
}

function swallow(
  item: ParentNode,
  source: string,
  ancestors: readonly ParentNode[],
): void {
  const at = item.children.findIndex((child) => isComment(child));
  if (at === -1) return;

  const comment = item.children[at] as unknown as CommentNode;
  const from = comment.position?.start?.offset;
  if (from === undefined) return;
  // Only an UNCLOSED opener. A closed region is `commentRegionTransform`'s job, and claiming it
  // here is what broke the container lift once before: that pass locates a region's host by
  // strict containment, so moving the opener out from under it leaves the region unrebuilt and
  // turns a buried definition live.
  if (source.slice(from + MARKER.length).includes(MARKER)) return;

  const reach = itemBound(source, from);

  /**
   * Along the ANCESTOR CHAIN, innermost first, because the blocks this comment swallows are
   * not necessarily its siblings.
   *
   * Inside a quote the definition is the comment's UNCLE: `> +  %%` / `> [^note]: It` arrives
   * as `blockquote > [ list > listItem > comment, footnoteDefinition ]`, so the comment is the
   * item's only child and a sibling-only scan declines the whole case. That is the exact
   * first-version bug `quote-comment-lazy.ts` records -- "a root-only lookup finds nothing and
   * the first version of this pass fired on two documents instead of six" -- and this pass had
   * it too, which `probe/item-comment/quoted` caught while the five unquoted cases passed.
   *
   * The bound is what makes walking out to the root safe: a trailing paragraph after a blank
   * line starts past `reach`, so `use[^note]` is never taken even though the root is on the
   * chain.
   */
  const chain: ParentNode[] = [...ancestors, item];
  const swallowed: RootContent[] = [];
  for (let level = chain.length - 1; level >= 0; level--) {
    const parent = chain[level]!;
    const anchor =
      level === chain.length - 1
        ? (item.children[at] as unknown as RootContent)
        : (chain[level + 1] as unknown as RootContent);
    const seat = parent.children.indexOf(anchor);
    if (seat === -1) continue;
    while (seat + 1 < parent.children.length) {
      const next = parent.children[seat + 1];
      const start = next?.position?.start?.offset;
      if (start === undefined || start >= reach) break;
      swallowed.push(...parent.children.splice(seat + 1, 1));
    }
  }
  if (swallowed.length === 0) return;

  comment.value = source.slice(from + MARKER.length, reach);
  if (comment.position) comment.position.end = pointOf(source, reach);
  comment.children = swallowed;

  // The descent is the unit of work: a span is not corrected until every ancestor's is, or
  // `invariants.test.ts` reports a child ending after its parent. Only ancestors that end
  // SHORT of the new reach move, so a container already covering it is left alone.
  for (const ancestor of [item, ...ancestors].reverse()) {
    const node = ancestor as unknown as {
      type?: string;
      position?: { end: { line: number; column: number; offset?: number } };
    };
    if (node.type === "root" || !node.position) continue;
    if ((node.position.end.offset ?? 0) >= reach) continue;
    node.position.end = pointOf(source, reach);
  }
}

/** Where the item holding the opener ends: the first line that cannot lazily continue it. */
function itemBound(source: string, from: number): number {
  let at = source.indexOf("\n", from);
  if (at === -1) return source.length;
  at += 1;
  while (at < source.length) {
    const nl = source.indexOf("\n", at);
    const end = nl === -1 ? source.length : nl;
    const line = source.slice(at, end);
    if (line.replace(/^[ \t>]+/u, "").trim() === "" || ENDS_ITEM.test(line)) {
      return at - 1;
    }
    if (nl === -1) return source.length;
    at = nl + 1;
  }
  return trimmed(source, from);
}

/**
 * The end of the last content character, never a trailing line ending.
 *
 * Returning `source.length` extends the host a line too far, which `compute.test.ts` catches as
 * a second `sections` divergence while the corpus delta stays green -- the exact failure
 * `quote-comment-lazy.ts` records from its own first version.
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
  return {
    line: before.split("\n").length,
    column: offset - (before.lastIndexOf("\n") + 1) + 1,
    offset,
  };
}
