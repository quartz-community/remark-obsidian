import type { Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface ParentNode extends Node {
  children: RootContent[];
}

interface TagNode extends Node {
  type: "tag";
  value: string;
}

/**
 * A tag does not start straight after a literal `]`.
 *
 * `# [^1[[a#^blk\]]#tag` renders `1[[a#^blk\]#tag` in Obsidian and reports **no** tag:
 * the reference's label runs to the first `]`, the next `]` is ordinary text, and a `#`
 * against it is text too. We reported `tag`.
 *
 * The distinction is what the bracket belonged to, which the tokenizer cannot see --
 * `self.previous` is `]` either way -- and the tree can. After a *construct's* closer a
 * tag does start: `a[[t]]#next` reports one, and there the tag's previous sibling is a
 * `wikilink` rather than text. The corpus separates the two cleanly: four cases put a
 * tag against non-whitespace text, three are `[` and match (`[#tag]`, `[#tag](u)` and
 * `[#a/b]]` all report a tag, which is the recorded single-opener rule), and the fourth
 * is this `]`.
 *
 * Demoted to text rather than dropped, so the characters the author wrote stay in the
 * tree and both `tags` and `meta.tags` lose it together -- which is what Obsidian
 * reports, empty in both.
 */
export function tagAfterCloserTransform(tree: Root): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;
    const kids: RootContent[] = parent.children;

    for (let index = kids.length - 1; index >= 1; index--) {
      const tag = kids[index];
      if (tag?.type !== "tag") continue;
      const before = kids[index - 1];
      if (before?.type !== "text" || !before.value.endsWith("]")) continue;

      const written = `#${(tag as unknown as TagNode).value}`;
      before.value += written;
      if (before.position && tag.position?.end) {
        before.position.end = { ...tag.position.end };
      }
      kids.splice(index, 1);
    }
  });
}
