import type { Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface ParentNode extends Node {
  children: RootContent[];
}

/**
 * A `[^` before an inline footnote's `^[` is a reference opener, and wins.
 *
 * `[^[^1]` is a footnote *reference* whose label runs to the first `]`, so the label is
 * `[^1` and -- nothing defining it -- it renders as its own bare text. We build an
 * inline footnote instead, because `^[` opens one and our construct sees that `^`
 * first:
 *
 *     ][^[^1]](      obs `][^1](`      we had `][⟨fn⟩](`
 *     ·[^[^1]·       obs `[^1`         we had `[⟨fn⟩`
 *
 * Nothing is counted: the label is everything up to the first `]`, brackets included,
 * which is the recorded footnote-label rule and the reason `bracketLabelReferences`
 * closed 17 of the 18 cases in this family. These are the last two.
 *
 * A repair rather than a tokenizer guard, because the guard is already refuted:
 * declining `^[` after a `[` costs `context/link-label/inline-footnote` and lets the
 * *wikilink* win instead, so `[^[[a]]]` becomes a link to `a` where Obsidian reports
 * the literal `[[a]]` and no link. The tree can ask what the bracket belongs to; the
 * tokenizer cannot, at the point it has to decide.
 *
 * Both recorded cases are the target and there are no controls, which is what keeps the
 * shape tight: the previous sibling must be text ending in the opener's own `[`, and
 * the closer must sit inside the same block.
 */
export function doubledFootnoteOpenerTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;
    const kids: RootContent[] = parent.children;
    const limit = (node as Node).position?.end?.offset ?? source.length;

    for (let index = kids.length - 1; index >= 1; index--) {
      if (kids[index]?.type !== "footnote") continue;
      const before = kids[index - 1];
      if (before?.type !== "text" || !before.value.endsWith("[")) continue;

      const prevEnd = before.position?.end?.offset;
      const noteEnd = kids[index]!.position?.end?.offset;
      if (prevEnd === undefined || noteEnd === undefined) continue;

      const openAt = prevEnd - 1;
      if (source[openAt] !== "[" || source[openAt + 1] !== "^") continue;

      const labelFrom = openAt + 2;
      const closeAt = source.indexOf("]", labelFrom);
      if (closeAt === -1 || closeAt >= limit) continue;
      const label = source.slice(labelFrom, closeAt);
      if (label === "") continue;

      const reference = {
        type: "footnoteReference",
        identifier: label.toLowerCase(),
        label,
        position: {
          start: { line: 0, column: 1, offset: openAt },
          end: { line: 0, column: 1, offset: closeAt + 1 },
        },
      } as unknown as RootContent;

      // The opener leaves the text that held it.
      before.value = before.value.slice(0, -1);
      if (before.position) {
        before.position.end = { ...before.position.end, offset: openAt };
      }

      const replacement: RootContent[] = [reference];
      // Anything the inline footnote covered past the reference's closer is content
      // again, which is what keeps `](` in `][^[^1]](`.
      if (noteEnd > closeAt + 1) {
        replacement.push({
          type: "text",
          value: source.slice(closeAt + 1, noteEnd),
          position: {
            start: { line: 0, column: 1, offset: closeAt + 1 },
            end: { line: 0, column: 1, offset: noteEnd },
          },
        } as Text);
      }
      kids.splice(index, 1, ...replacement);
      if (before.value === "") kids.splice(index - 1, 1);
    }
  });
}
