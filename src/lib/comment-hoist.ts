import type { Paragraph, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import type { Comment } from "./types.js";

interface ParentNode extends Node {
  children: Node[];
}

const spansLines = (node: Node): boolean =>
  (node.position?.end?.line ?? 0) > (node.position?.start?.line ?? 0);

const MARKER = "%%";
const CONTAINERS = new Set(["list", "blockquote", "callout"]);

/**
 * Lift a multi-line `%%` comment out of the paragraph that swallowed it.
 *
 * Obsidian reports a block comment as its own section, even when its closing `%%`
 * sits mid-line and the rest of that line continues as a paragraph:
 * `%%\nline %% nested %% line` is a comment, then a paragraph. A flow construct
 * in micromark owns whole lines and cannot stop mid-line, so the comment is
 * tokenized inline and ends up as the paragraph's first child instead.
 *
 * Hoisting restores the block split without rewriting the source, so positions
 * stay true to the document the author wrote. Only a comment that spans lines
 * moves: a single-line `%%note%% tail` is inline in Obsidian too.
 */
export function commentHoistTransform(tree: Root, source: string): void {
  visit(tree, "paragraph", (node: Node, index, parent) => {
    if (!parent || typeof index !== "number") return;

    const paragraph = node as Paragraph;
    const lead = paragraph.children[0] as Node | undefined;
    if (!lead || lead.type !== "comment" || !spansLines(lead)) return;
    if (lead.position?.start?.offset !== paragraph.position?.start?.offset) {
      return;
    }

    paragraph.children.shift();

    // The paragraph now starts where the comment ended, or the source slice taken
    // from its position would still cover the comment.
    if (paragraph.position && lead.position?.end) {
      paragraph.position.start = { ...lead.position.end };
    }

    // A comment that is already a container's DIRECT child is a different shape and is
    // handled by `liftContainerComment` below, which this guard never reaches: the comment
    // there is not a paragraph's first child.
    const siblings = (parent as ParentNode).children;
    const remaining = paragraph.children.length > 0;
    siblings.splice(index, remaining ? 0 : 1, lead as Comment);
    return index + (remaining ? 2 : 1);
  });

  liftContainerComment(tree, source);
}

/** The end of the note, as a point: an unclosed comment runs here. */
function endPoint(source: string): {
  line: number;
  column: number;
  offset: number;
} {
  const lines = source.split("\n");
  return {
    line: lines.length,
    column: (lines[lines.length - 1]?.length ?? 0) + 1,
    offset: source.length,
  };
}

/** Shrink a container onto its last remaining child, after the comment has left it. */
function pullBack(node: ParentNode): void {
  const last = node.children[node.children.length - 1];
  if (node.position && last?.position?.end) {
    node.position.end = { ...last.position.end };
  }
}

/**
 * The ancestor chain down to the node holding a column-zero `comment`, deepest first.
 *
 * Returned as a PATH rather than just the holder, because lifting the comment shortens every
 * container above it: `> > quote` / `%%` has to shrink the inner quote and the outer one, and
 * pulling back only the holder leaves the outer span still covering a line it no longer owns
 * -- which `invariants.test.ts` would report as a child outside its parent.
 *
 * Searched from the END of each child list, since the comment this pass exists for is the
 * last thing in its container. A comment at index 0 is a different shape -- `- %%`, where the
 * marker is the item's own content -- and the caller declines it.
 */
function findColumnZeroComment(node: ParentNode): ParentNode[] | undefined {
  const children = node.children;
  if (!Array.isArray(children)) return undefined;

  for (let index = children.length - 1; index >= 0; index--) {
    const child = children[index] as Node;
    if (child.type === "comment" && child.position?.start?.column === 1) {
      return index > 0 ? [node] : undefined;
    }
    const deeper = findColumnZeroComment(child as unknown as ParentNode);
    if (deeper) return [node, ...deeper];
  }
  return undefined;
}

/**
 * A column-zero `%%` does not belong to the container above it.
 *
 * `- item` / `text` / `%%` and `> quote` / `%%` report `list`/`comment` and
 * `blockquote`/`comment` as two ROOT sections in Obsidian, and the comment runs to the end of
 * the note swallowing whatever follows. Our tokenizer leaves it a direct child of the
 * `listItem` or the `blockquote` -- the line is at column 0, so it continues neither -- with
 * its extent stopping at the container's own end and the trailing block surviving beside it.
 *
 * The rule is already measured for a sibling construct: `definition-trim.ts` records that a
 * nested definition does NOT absorb a column-0 bare `%%`, ten cases against zero. A root
 * `%%` already behaves correctly here, which is the shape this reproduces -- `%%` / blank /
 * `use[^1]` is one `comment` whose swallowed content hangs off it as CHILDREN.
 *
 * Keeping the swallowed content as children rather than deleting it is what makes this safe,
 * and that is measured rather than assumed. `score.mts` scored two candidates over all 6,818
 * referee documents:
 *
 *     container-comment-swallows        better 0  worse 10   net -8
 *     container-comment-swallows-defs   better 0  worse  0    NOT ADJUDICABLE
 *
 * The first drops every fact below the swallowing `%%` and loses ten documents, in every one
 * of which the DEFINITIONS are identical -- the entire loss is references Obsidian still
 * indexes below an unclosed opener. The second drops only definitions and touches NOTHING: in
 * 6,818 documents there is not one where this rule changes which definitions exist.
 *
 * So this family is SECTION GEOMETRY ONLY, invisible to the referee's oracle by construction,
 * the same way four of the `UPSTREAM.md` defects are. It is gated on `compose.mts` improving
 * while the referee and the corpus hold STILL, and nothing here may drop a reference. Setting
 * the span and clearing `children` for `commentParseTransform` to refill -- the pattern
 * `comment-quote-extent.ts` already uses -- keeps every reference in the tree.
 */
function liftContainerComment(tree: Root, source: string): void {
  if (source === "") return;

  for (let index = tree.children.length - 1; index >= 0; index--) {
    const container = tree.children[index];
    if (!container || !CONTAINERS.has(container.type)) continue;

    // Searched to any DEPTH, not just the container's own children. `> > quote` / `%%` and
    // `- - item` / `%%` put the comment in the INNER container, so a one-level lookup -- a
    // quote's own children, or a list's last item -- finds nothing and the comment stays
    // buried. `compose.mts --nested` found five such shapes across both marker types, and
    // every ancestor on the way down has to shrink, not just the one holding it.
    const path = findColumnZeroComment(container as unknown as ParentNode);
    if (!path) continue;

    const host = path[path.length - 1]!;
    const at = host.children.findIndex(
      (child) =>
        (child as Node).type === "comment" &&
        (child as Node).position?.start?.column === 1,
    );
    if (at <= 0) continue;

    const comment = host.children[at] as unknown as Comment;
    const from = comment.position?.start?.offset;
    if (from === undefined) continue;

    // ONLY an unclosed opener, tested BEFORE any surgery. A closed `%%...%%` region is
    // already `commentRegionTransform`'s job, and lifting it first is what stops that pass
    // working: `rebuild` locates the region's host with `from < start && to > start`, so it
    // needs a root child STRICTLY CONTAINING the opener. Lifting the comment to a root
    // sibling starting exactly AT the region start, and shrinking the container off it,
    // leaves no such child and the region is never rebuilt -- which turns
    // `> q` / `%%` / `[^1]: def` / `%%` from a buried definition into a live one and loses
    // the reference Obsidian indexes at its label. That is the commented-definition rule,
    // worth +123 documents, so the ordering here is load-bearing rather than tidy.
    if (source.slice(from + MARKER.length).includes(MARKER)) continue;

    host.children.splice(at);
    // Deepest first, so each ancestor shrinks onto a child that has already shrunk.
    for (const ancestor of [...path].reverse()) pullBack(ancestor);
    tree.children.splice(index + 1, 0, comment as unknown as RootContent);

    comment.value = source.slice(from + MARKER.length);
    if (comment.position) comment.position.end = endPoint(source);
    delete (comment as { children?: unknown }).children;
    tree.children.splice(index + 2);
  }
}
