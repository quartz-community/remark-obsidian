import type { Options } from "mdast-util-to-markdown";
import type { Tag } from "../types.js";

export function tagToMarkdown(): Options {
  return {
    handlers: {
      tag(node: Tag) {
        return `#${node.value}`;
      },
    },
  };
}
