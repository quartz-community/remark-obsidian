import type { Options } from "mdast-util-to-markdown";
import type { Comment } from "../types.js";

export function commentToMarkdown(): Options {
  return {
    handlers: {
      comment(node: Comment) {
        return `%%${node.value}%%`;
      },
    },
  };
}
