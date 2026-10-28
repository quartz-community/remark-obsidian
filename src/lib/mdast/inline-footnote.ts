import type { Extension } from "mdast-util-from-markdown";

/**
 * `footnote` is the historical mdast type for an inline footnote, and the one
 * `remark-footnotes` emits — which is what Obsidian itself parses with, so it is
 * the shape a consumer matching Obsidian expects. `mdast-util-gfm-footnote` has no
 * inline form, so nothing else claims the name.
 */
export function inlineFootnoteFromMarkdown(): Extension {
  return {
    // The body is one content token per line with a `lineEnding` between them, and
    // `mdast-util-from-markdown` keeps a line ending as text only inside the types listed here.
    // Unlisted, `^[a` / `b]` held `ab`, and formatting wrote the two words back as one (found
    // by `fuzz/invariant-sweep.ts`).
    canContainEols: ["footnote"],
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
