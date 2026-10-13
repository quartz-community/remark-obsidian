import type { Paragraph, Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import type { Comment } from "./types.js";

interface ParentNode extends Node {
  children: Node[];
}

const spansLines = (node: Node): boolean =>
  (node.position?.end?.line ?? 0) > (node.position?.start?.line ?? 0);

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
export function commentHoistTransform(tree: Root): void {
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

    // A COLUMN-ZERO comment does not belong to the container above it, and this hoist leaves
    // it there: `- item` / `%%` and `> quote` / `%%` report `list`/`comment` and
    // `blockquote`/`comment` as two ROOT sections in Obsidian, where the comment ends up a
    // child of the `listItem` or the `blockquote` because that is the paragraph's parent.
    // `compose.mts` found all four shapes -- bullet, ordered, quote and callout.
    //
    // The rule is already measured for a sibling construct: `definition-trim.ts` records
    // that a nested definition does NOT absorb a column-0 bare `%%`, ten cases against
    // zero, because that line sits outside the container it would have to continue.
    //
    // ATTEMPTED AND REVERTED, because the fix has two halves and only one is here. Lifting
    // the comment to the container's own parent puts it in the right PLACE -- verified,
    // `blockquote[0..8]` then `comment[8..10]` then the paragraph -- and leaves its EXTENT
    // wrong: an unclosed `%%` runs to the end of the note, which a root `%%` already does
    // here (`%%` / blank / `use[^1]` is one `comment` section) and a lifted one does not,
    // because whichever pass extends a root comment has already run. So the lifted comment
    // stops short and the trailing paragraph survives, where Obsidian has swallowed it.
    //
    // Measured: 0 parity regressions, `compose` unchanged at 10 of 256 since the rows differ
    // either way, and the referee 78.9% down by one document.
    //
    // That referee -1 is NOISE, and `score.mts` is where that was established rather than
    // guessed. Two candidates were scored over all 6,818 documents:
    //
    //     container-comment-swallows        better 0  worse 10   net -8
    //     container-comment-swallows-defs   better 0  worse  0    NOT ADJUDICABLE
    //
    // The first drops every fact below the swallowing `%%`; all ten of its documents move the
    // wrong way, and in each the DEFINITIONS are identical -- the whole loss is references
    // Obsidian still indexes below an unclosed opener. The second drops only definitions and
    // touches NOTHING: in 6,818 documents there is not one where this rule changes which
    // definitions exist.
    //
    // So this family is SECTION GEOMETRY ONLY, invisible to the referee's oracle by
    // construction, the same way four of the upstream defects in `UPSTREAM.md` are. The gate
    // for closing it is therefore `compose.mts` improving while the referee and the corpus
    // both hold STILL -- not the referee improving, which it cannot do here. And no part of
    // the fix may drop a reference.
    //
    // Closing it needs the extent re-DERIVED, not inherited: the end-of-note run of an
    // unclosed `%%` comes from the tokenizer consuming to EOF, and a hoisted node's extent
    // was already fixed while the container still bounded it. Reordering passes cannot
    // supply it, so the lift has to take `source`, re-measure the closer, and remove the
    // siblings it swallows.
    const siblings = (parent as ParentNode).children;
    const remaining = paragraph.children.length > 0;
    siblings.splice(index, remaining ? 0 : 1, lead as Comment);
    return index + (remaining ? 2 : 1);
  });
}
