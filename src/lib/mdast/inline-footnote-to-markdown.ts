import type { Options, State, Info } from "mdast-util-to-markdown";
import type { Parents } from "mdast";
import type { InlineFootnote } from "../types.js";

export function inlineFootnoteToMarkdown(): Options {
  return {
    handlers: {
      footnote(
        node: InlineFootnote,
        _parent: Parents | undefined,
        state: State,
        info: Info,
      ) {
        const tracker = state.createTracker(info);
        let value = tracker.move("^[");
        value += state.containerPhrasing(node, {
          ...tracker.current(),
          before: value,
          after: "]",
        });
        value += tracker.move("]");
        return value;
      },
    },
  };
}
