import type { Extension } from "mdast-util-from-markdown";

/**
 * `footnote` is the historical mdast type for an inline footnote, and the one
 * `remark-footnotes` emits — which is what Obsidian itself parses with, so it is
 * the shape a consumer matching Obsidian expects. `mdast-util-gfm-footnote` has no
 * inline form, so nothing else claims the name.
 */
export function inlineFootnoteFromMarkdown(): Extension {
  return {
    enter: {
      inlineFootnote(token) {
        this.enter({ type: "footnote", children: [] }, token);
      },
    },
    exit: {
      inlineFootnote(token) {
        this.exit(token);
      },
    },
  };
}
