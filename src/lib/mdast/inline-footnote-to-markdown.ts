import type { Options, State, Info } from "mdast-util-to-markdown";
import type { Parents } from "mdast";
import type { InlineFootnote } from "../types.js";

export function inlineFootnoteToMarkdown(): Options {
  return {
    // A `]` in an inline footnote's text closes it, so it is escaped there: written bare,
    // `^[a\\]b]` came back as `^[a]` and `b]` (found by `fuzz/invariant-sweep.ts`).
    unsafe: [{ character: "]", inConstruct: "inlineFootnote" as never }],
    handlers: {
      footnote(
        node: InlineFootnote,
        _parent: Parents | undefined,
        state: State,
        info: Info,
      ) {
        const tracker = state.createTracker(info);
        const exit = state.enter("inlineFootnote" as never);
        let value = tracker.move("^[");
        value += balanceBrackets(
          state.containerPhrasing(node, {
            ...tracker.current(),
            before: value,
            after: "]",
          }),
        );
        value += tracker.move("]");
        exit();
        return value;
      },
    },
  };
}

/**
 * An inline footnote ends at the first unescaped `]` that closes its own `[`: the reader counts
 * raw brackets and steps over escaped ones. The writer escapes brackets in text but not the ones
 * a wikilink writes, so `^[[[[[target]]]]]` (text `[`, a wikilink to `[target`, text `]]`) came
 * back as `^[\[[[[target]]\]\]]`, whose raw brackets never close (found by
 * `fuzz/invariant-sweep.ts`). A raw `]` that would close early takes an escaped `[` before it
 * as its partner, written bare, or failing one is escaped; and while raw `[` are left open the
 * last escaped `]` are written bare. Not inside a code span, whose brackets
 * the reader does not count, so content holding one is left as it is.
 */
export function balanceBrackets(content: string): string {
  if (content.includes("`")) return content;
  const units = content.match(/\\[\s\S]|[\s\S]/gu) ?? [];
  let open = 0;
  /** Escaped `[` not yet given a partner, earliest first. */
  const escapedOpeners: number[] = [];
  for (let index = 0; index < units.length; index++) {
    if (units[index] === "[") open++;
    else if (units[index] === "\\[") escapedOpeners.push(index);
    else if (units[index] === "]") {
      if (open > 0) open--;
      // An escaped `[` before it is its partner, as the source wrote it: `[![[]]]` holds text
      // `[` and an embed of `]`, written `\\[![[]]]`.
      else if (escapedOpeners.length > 0) units[escapedOpeners.shift()!] = "[";
      else units[index] = "\\]";
    }
  }
  for (let index = units.length - 1; index >= 0 && open > 0; index--) {
    if (units[index] === "\\]") {
      units[index] = "]";
      open--;
    }
  }
  return units.join("");
}
