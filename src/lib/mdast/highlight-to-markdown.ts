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
        // Its content sits between its own markers, not where the highlight does: given the
        // highlight's `before`, a formula opening a highlight at a line start took the `&#x20;`
        // meant for a line start, which read back as a text node (about 110 seeds of the
        // million-seed census, under "formatting keeps the tree").
        const content = state.containerPhrasing(node, {
          ...info,
          before: "==",
          after: "==",
        });
        exit();
        return `==${guardClosers(content, info.before === "\n" || info.before === "")}==`;
      },
    },
  };
}

/**
 * A highlight closes at the first `==` its scan meets, and the scan reads raw characters: an
 * escape does not hide a `=` from it. So `==mark⏎=`, its last `=` escaped against setext,
 * closed one character early, on the escaped `=`, leaving a backslash in the content and the
 * `=` outside (found by `fuzz/invariant-sweep.ts`). Inside a highlight, every `=` that would touch
 * another `=` or the closer is written as a character reference, which the scan passes over
 * and the inline parse still reads as `=`. So is a first `=` touching the opener at a line start,
 * where `===` is a setext underline (`probe/straddle-fold/inline-refold`); not elsewhere, where
 * `]====k==` moved the opener.
 */
function guardClosers(content: string, lineStart: boolean): string {
  const units = content.match(/\\[\s\S]|&#?[\da-z]+;|[\s\S]/giu) ?? [];
  const equals = (unit: string | undefined) => unit === "=" || unit === "\\=";
  return units
    .map((unit, index) =>
      equals(unit) &&
      ((index === 0 && lineStart) ||
        index === units.length - 1 ||
        equals(units[index + 1]) ||
        unit !== "=")
        ? "&#x3D;"
        : unit,
    )
    .join("");
}
