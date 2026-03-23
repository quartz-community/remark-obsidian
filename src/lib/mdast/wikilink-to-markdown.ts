import type { Options } from "mdast-util-to-markdown";
import type { Wikilink } from "../types.js";

export function wikilinkToMarkdown(): Options {
  return {
    handlers: {
      wikilink(node: Wikilink) {
        const prefix = node.embedded ? "!" : "";
        const heading = node.heading ? `#${node.heading}` : "";
        const alias = node.alias ? `|${node.alias}` : "";
        return `${prefix}[[${node.path}${heading}${alias}]]`;
      },
    },
  };
}
