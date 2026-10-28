import type { Options } from "mdast-util-to-markdown";
import type { Comment } from "../types.js";

export function commentToMarkdown(): Options {
  return {
    // A `%%` that is text must stay text: written bare, `\\%%note%%` came back from a format as a
    // comment, hiding the words (found by `fuzz/invariant-sweep.ts`).
    unsafe: [{ character: "%", after: "%", inConstruct: "phrasing" }],
    handlers: {
      comment(node: Comment) {
        return `%%${node.value}%%`;
      },
    },
  };
}
