import type { Blockquote, List, Paragraph, Root } from "mdast";

const CONTAINERS = new Set(["list", "blockquote", "callout"]);

/**
 * Extend a container over the unindented line that follows it.
 *
 * CommonMark only allows lazy continuation into a paragraph, so a line at column
 * zero after a closed fence inside a list or blockquote ends the container and
 * starts a new block. Obsidian keeps it inside: `> ```\n> x\n> ```\nreal` is one
 * blockquote to it, where we reported a blockquote plus a paragraph.
 *
 * A line that looks like a footnote definition is absorbed into a quote too. It
 * does not interrupt the continuation any more than it interrupts a paragraph,
 * so `> [^1]: quoted def` / `plain column-0 line` / `[^2]: second` is all one
 * blockquote.
 *
 * Only a block on the very next line is absorbed. A blank line between them
 * still ends the container, which is what keeps ordinary documents untouched.
 */
export function containerLazyTransform(tree: Root, source: string): void {
  const children = tree.children;

  for (let index = children.length - 2; index >= 0; index--) {
    const container = children[index];
    const next = children[index + 1];
    if (!container || !next) continue;
    if (!CONTAINERS.has(container.type)) continue;
    if (next.type !== "paragraph") {
      if (
        next.type !== "footnoteDefinition" &&
        next.type !== "table" &&
        next.type !== "math"
      ) {
        continue;
      }
    }

    // Measure the gap from the last non-whitespace character, not from the
    // container's end offset. An unclosed fence inside a list item pulls the
    // container's span over the following newline, so slicing from its end sees
    // one newline where the document has a blank line.
    const gapEnd = next.position?.start?.offset;
    if (gapEnd === undefined) continue;
    const before = source.slice(0, gapEnd);
    const trailing = /\s+$/.exec(before);
    if (trailing && /\n[ \t]*\n/.test(trailing[0])) continue;

    const parent = container as List | Blockquote;
    const target =
      parent.type === "list"
        ? parent.children[parent.children.length - 1]
        : parent;
    if (!target || !("children" in target)) continue;

    (target.children as unknown[]).push(next as Paragraph);
    if (parent.position && next.position?.end) {
      parent.position.end = { ...next.position.end };
    }
    if (target !== parent && target.position && next.position?.end) {
      target.position.end = { ...next.position.end };
    }
    children.splice(index + 1, 1);
  }
}
