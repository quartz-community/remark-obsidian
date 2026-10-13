import type { Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/**
 * A `$$` block opened in a container and never closed keeps consuming.
 *
 * CommonMark ends an unterminated block at the end of its container, so
 * `> $$` followed by an unindented `lazy` line closes the math and starts a
 * paragraph. Obsidian leaves the block open and swallows the line, which
 * matters because the swallowed text stops rendering: a `[^1]` in it is part
 * of a formula, not a footnote reference.
 *
 * Measured against the legacy stack, `remark-parse@8` with `remark-math`
 * agrees with Obsidian here, unlike the `<!--` and mid-line `$$` shapes nearby
 * where it does not.
 *
 * Only a sibling starting at column 1 is absorbed, the same rule the unclosed
 * fence uses: an indented block belongs to the container on either reading.
 */
function unterminated(slice: string): boolean {
  if (!slice.startsWith("$$")) return false;
  return !slice.slice(2).includes("$$");
}

/**
 * NOT THIS PASS, and a blank-line guard added here was inert -- measured, not assumed.
 *
 * `- item` / `$$` / blank / `use[^1]` reports `list@0-1` and `paragraph@3-3` in Obsidian,
 * while we swallow `use[^1]` into the formula and lose its `footnoteReference` from the tree
 * entirely. Guarding this pass's absorb loop on a blank line above the next sibling moved
 * NOTHING on any of the five compose axes, the referee or the corpus -- because this pass is
 * not what absorbs it. Bare `remark-parse` + `remark-gfm` + `remark-math` already reports
 * `math[2-5]` valued `"\nuse[^1]"` for that input: the swallow is upstream, in the tokenizer,
 * and an unclosed `$$` consumes to EOF before any pass here runs.
 *
 * The rule, from six controls against live 1.14.4:
 *
 *     $$ / blank / use[^1]                   math@0-3              root: runs to EOF
 *     - item / $$ / blank / use[^1]          list@0-1, para@3      BOUNDED by the blank line
 *     - item / $$ / more / blank / use[^1]   list@0-2, para@4      takes `more`, stops at blank
 *     > quote / $$ / blank / use[^1]         quote@0-0, math@1-4   not absorbed, runs to EOF
 *     - item / blank / $$ / blank / use[^1]  list@0-0, math@2-5    list already closed
 *     para / $$ / blank / use[^1]            para@0-0, math@1-4    not absorbed either
 *
 * So an unclosed `$$` is bounded by a blank line ONLY when a LIST absorbs it, and runs to the
 * end of the note everywhere else -- the same shape as
 * `commentDefinitionExtentTransform`'s rule, where only a container that is itself
 * blank-line-terminated bounds the opener. The quote and paragraph rows are already correct.
 *
 * Closing it belongs in `containerLazyTransform`, where the absorption happens: the math node
 * has to be TRUNCATED at the blank line and its tail re-parsed as root siblings, which is
 * more than that pass does today -- it moves whole nodes. Two pair cells, two nested cells
 * and eight isolate rows wait on it.
 */

export function mathOutlivesTransform(tree: Root, source: string): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length - 1; index++) {
      const block = parent.children[index];
      if (block?.type !== "math") continue;

      const start = block.position?.start?.offset;
      const end = block.position?.end?.offset;
      if (start === undefined || end === undefined) continue;
      if (!unterminated(source.slice(start, end))) continue;

      let last = index;
      while (
        last + 1 < parent.children.length &&
        parent.children[last + 1]!.position?.start?.column === 1
      ) {
        last++;
      }
      if (last === index) continue;

      const absorbed = parent.children[last]!.position?.end?.offset;
      if (absorbed === undefined) continue;

      block.value += source.slice(end, absorbed);
      if (block.position && parent.children[last]!.position?.end) {
        block.position.end = { ...parent.children[last]!.position!.end };
      }
      parent.children.splice(index + 1, last - index);
      return;
    }
  });
}
