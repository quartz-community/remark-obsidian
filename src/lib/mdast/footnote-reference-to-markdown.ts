import type { Options, State, Info } from "mdast-util-to-markdown";
import type { FootnoteReference, Parents } from "mdast";

/**
 * Write a footnote reference's label verbatim, brackets and all.
 *
 * `mdast-util-to-markdown` escapes a `[` inside a label, which is right for
 * CommonMark and wrong here: Obsidian's label runs to the **first** `]`, so
 * `[^![[img.png]` re-parses to exactly the label it was written from while
 * `[^!\[\[img.png]` does not. Re-parsing those escapes gave a label holding
 * backslashes, which the next pass escaped again -- thirty corpus documents grew a
 * backslash per format and never settled.
 *
 * Only the label is written raw. The delimiters are still tracked through
 * `state.createTracker`, so a reference inside a construct that needs a safe
 * encoding still gets one for everything around it.
 */
export function footnoteReferenceToMarkdown(): Options {
  return {
    handlers: {
      footnoteReference(
        node: FootnoteReference,
        _parent: Parents | undefined,
        state: State,
        info: Info,
      ) {
        const tracker = state.createTracker(info);
        let value = tracker.move("[^");
        value += tracker.move(node.label ?? node.identifier);
        value += tracker.move("]");
        return value;
      },
    },
  };
}
