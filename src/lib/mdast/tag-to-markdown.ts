import type { Options } from "mdast-util-to-markdown";
import type { Tag } from "../types.js";

export function tagToMarkdown(): Options {
  return {
    // A `#` that is text must stay text: written bare, `x \\#tag` came back from a format as a
    // tag (found by `fuzz/invariant-sweep.ts`). Only where a tag could start, before a non-space:
    // after whitespace, at a line start, or after ASCII punctuation -- which the writer may itself
    // escape or encode, and an escape or a character reference counts as a construct a tag may
    // follow, so `](#tag` written `]\\(#tag` and `&amp;#a` written `\\&#a` both grew a tag. A `#`
    // after a letter or digit -- `page#section`, `C#` -- is left alone.
    unsafe: [
      {
        character: "#",
        before: "[\\s!-/:-@\\[-`{-~]",
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
    // `#` after an escape or a character reference is `textToMarkdown`'s, which the rule above
    // cannot reach.
    handlers: {
      tag(node: Tag) {
        return `#${node.value}`;
      },
    },
  };
}
