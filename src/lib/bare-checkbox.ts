import type { ListItem, Paragraph, Root, Text } from "mdast";
import { visit } from "unist-util-visit";

/** A list marker and checkbox at the head of an item's own line. */
const CHECKBOX = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+)(\[[^\]\n]?\])[ \t]*$/u;

/**
 * A checkbox with nothing after it on its line is not a task.
 *
 * Obsidian wants the content on the **same line**: `- [ ]` followed by `===` is a
 * list holding the text `[ ]`, underlined into a heading, and `- [ ]` followed by
 * `![[*` reads `[ ] ![[*`. Neither reports a task at all.
 *
 * Micromark marks the item whenever content follows, and a lazy continuation
 * counts, so `- [ ]` over a non-blank line became a task whose body was that line
 * and the `[ ]` vanished from the rendered text. All four recorded cases on this
 * shape agree that Obsidian reports no task -- the two that already matched do so
 * because their next line is an html block or sits past a blank, neither of which
 * continues the paragraph, so micromark never marked them either.
 *
 * The checkbox goes back as text rather than being dropped, because it is still in
 * the file: this is the same rule as a dangling footnote reference, where the
 * characters survive in the tree and only the rendering changes.
 */
export function bareCheckboxTransform(tree: Root, source: string): void {
  visit(tree, "listItem", (item: ListItem) => {
    if (typeof item.checked !== "boolean") return;

    const itemStart = item.position?.start?.offset;
    if (itemStart === undefined) return;

    const lineEnd = source.indexOf("\n", itemStart);
    const line = source.slice(
      itemStart,
      lineEnd === -1 ? source.length : lineEnd,
    );
    const match = CHECKBOX.exec(line);
    if (!match) return;

    const [first] = item.children;
    if (first?.type !== "paragraph") return;

    const boxFrom = itemStart + match[1]!.length;
    const boxTo = boxFrom + match[2]!.length;
    const box: Text = {
      type: "text",
      value: match[2]!,
      position: {
        start: { line: item.position!.start.line, column: 1, offset: boxFrom },
        end: { line: item.position!.start.line, column: 1, offset: boxTo },
      },
    };

    // The line ending between the checkbox and the body needs a node of its own,
    // or the two run together: `- [ ]` over `![[*` read `[ ]![[*` against
    // Obsidian's `[ ] ![[*`. A `text` holding `"\n"` is the shape
    // `breakPositionsTransform` turns into a placed `break`, which
    // `multilineSetextTransform` already relies on.
    const ending: Text = {
      type: "text",
      value: "\n",
      position: {
        start: { line: item.position!.start.line, column: 1, offset: boxTo },
        end: { line: item.position!.start.line, column: 1, offset: boxTo + 1 },
      },
    };

    item.checked = null;
    (first as Paragraph).children.unshift(box, ending);
    if (first.position) {
      first.position.start = { ...box.position!.start };
    }
  });
}
