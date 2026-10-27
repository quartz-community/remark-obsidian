import type { Options, State, Info } from "mdast-util-to-markdown";
import type { FootnoteDefinition, FootnoteReference, Parents } from "mdast";

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

/**
 * Write a footnote definition's label verbatim, for the same reason as a reference's.
 *
 * `[^x[y]: d` came back as `[^x\[y]: d`, and under Obsidian's label rule -- a backslash escapes
 * nothing -- that is a definition named `x\[y`, so `[^x[y]` stopped resolving after one format.
 * The rest is `mdast-util-gfm-footnote`'s own handler (`firstLineBlank` off, its default).
 */
export function footnoteDefinitionToMarkdown(): Options {
  return {
    handlers: {
      footnoteDefinition(
        node: FootnoteDefinition,
        _parent: Parents | undefined,
        state: State,
        info: Info,
      ) {
        const tracker = state.createTracker(info);
        let value = tracker.move("[^");
        const exit = state.enter("footnoteDefinition");
        value += tracker.move(node.label ?? node.identifier);
        value += tracker.move("]:");
        if (node.children.length > 0) {
          tracker.shift(4);
          value += tracker.move(
            " " +
              state.indentLines(
                state.containerFlow(node, tracker.current()),
                (line, index, blank) =>
                  index === 0 ? line : (blank ? "" : "    ") + line,
              ),
          );
        }
        exit();
        return value;
      },
    },
  };
}
