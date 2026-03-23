import type { Options, State, Info } from "mdast-util-to-markdown";
import type { Parents } from "mdast";
import type { Highlight } from "../types.js";

export function highlightToMarkdown(): Options {
  return {
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
