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
