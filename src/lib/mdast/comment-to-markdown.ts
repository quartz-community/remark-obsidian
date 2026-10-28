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
        // A block comment straight under a paragraph, written on one line, joins that paragraph
        // as an inline comment (`1. a` / `   %%note%%`). Its closer on a line of its own makes
        // the opener line interrupt, as the source did (found by `fuzz/invariant-sweep.ts`).
        const siblings = (parent?.children ?? []) as Array<{ type: string }>;
        const previous = siblings[siblings.indexOf(node as never) - 1];
        if (
          parent &&
          FLOW.has(parent.type) &&
          previous?.type === "paragraph" &&
          !node.value.includes("\n")
        ) {
          return `%%${node.value}\n%%`;
        }
        return `%%${node.value}%%`;
      },
    },
  };
}
