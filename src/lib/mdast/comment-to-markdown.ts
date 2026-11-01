import type { Parents } from "mdast";
import type { Options } from "mdast-util-to-markdown";
import type { Comment } from "../types.js";

/** Containers whose children are blocks, where a comment is a block comment. */
const FLOW = new Set([
  "root",
  "listItem",
  "blockquote",
  "callout",
  "footnoteDefinition",
  "comment",
]);

export function commentToMarkdown(): Options {
  return {
    // A `%%` that is text must stay text: written bare, `\\%%note%%` came back from a format as a
    // comment, hiding the words (found by `fuzz/invariant-sweep.ts`).
    unsafe: [{ character: "%", after: "%", inConstruct: "phrasing" }],
    handlers: {
      comment(node: Comment, parent: Parents | undefined) {
        // A line of whitespace alone in the body is written empty: inside a container the
        // writer indents every line, so `[^1]:` / `······%%note` / `····` / `····%%` grew four
        // spaces on that line per format (the nightly invariant sweep, 2026-10-30). Hidden, it
        // renders nothing either way.
        // Interior lines only: `e%%⇥%%h` holds a comment of a tab alone, which written empty was
        // `%%%%` (240 seeds of the million-seed census), and a last line's indent is what keeps
        // `%%note` / `····%%no` one paragraph.
        const value = node.value
          .split("\n")
          .map((line, index, lines) =>
            index > 0 && index < lines.length - 1 && /^[ \t]+$/u.test(line)
              ? ""
              : line,
          )
          .join("\n");
        if (value !== node.value) node = { ...node, value };
        // A block comment written on one line reads as a paragraph holding an inline comment:
        // straight under a paragraph it joins that one (`1. a` / `   %%note%%`, found by
        // `fuzz/invariant-sweep.ts`), and anywhere else it becomes a paragraph of its own (about
        // 40 corpus documents failed "formatting keeps the tree" on that). Its closer on a line
        // of its own keeps it a block, as the source had it.
        if (parent && FLOW.has(parent.type) && !node.value.includes("\n")) {
          return `%%${node.value}\n%%`;
        }
        // A block comment whose body ends in `%` closes on its own line: written against the
        // closer, `%%%` closed one character early and left a `%` behind (`>>%%` / `%`).
        if (parent && FLOW.has(parent.type) && node.value.endsWith("%")) {
          return `%%${node.value}\n%%`;
        }
        return `%%${node.value}%%`;
      },
    },
  };
}
