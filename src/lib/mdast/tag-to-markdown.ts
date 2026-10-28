import type { Options } from "mdast-util-to-markdown";
import type { Tag } from "../types.js";

export function tagToMarkdown(): Options {
  return {
    // A `#` that is text must stay text: written bare, `x \\#tag` came back from a format as a
    // tag (found by `fuzz/invariant-sweep.ts`). Only where a tag could start -- after whitespace
    // or at a line start, before a non-space -- so `C# ` and `page#section` are left alone.
    unsafe: [
      {
        character: "#",
        before: "\\s",
        after: "[^\\s]",
        inConstruct: "phrasing",
      },
      {
        character: "#",
        atBreak: true,
        after: "[^\\s]",
        inConstruct: "phrasing",
      },
    ],
    handlers: {
      tag(node: Tag) {
        return `#${node.value}`;
      },
    },
  };
}
