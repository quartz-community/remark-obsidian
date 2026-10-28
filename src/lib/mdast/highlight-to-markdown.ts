import type { Options, State, Info } from "mdast-util-to-markdown";
import type { Parents } from "mdast";
import type { Highlight } from "../types.js";

export function highlightToMarkdown(): Options {
  return {
    // A `==` that is text must stay text, as for `%%`: mid-line, `x \\==mark==` came back from a
    // format as a highlight. At a line start the writer already escaped it, against setext.
    unsafe: [{ character: "=", after: "=[^\\s]", inConstruct: "phrasing" }],
    handlers: {
      highlight(
        node: Highlight,
        _parent: Parents | undefined,
        state: State,
        info: Info,
      ) {
        const exit = state.enter("highlight" as any);
        const content = state.containerPhrasing(node, info);
        exit();
        return `==${content}==`;
      },
    },
  };
}
