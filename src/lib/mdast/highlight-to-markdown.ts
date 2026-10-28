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
        return `==${guardClosers(content)}==`;
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
 * and the inline parse still reads as `=`.
 */
function guardClosers(content: string): string {
  const units = content.match(/\\[\s\S]|&#?[\da-z]+;|[\s\S]/giu) ?? [];
  const equals = (unit: string | undefined) => unit === "=" || unit === "\\=";
  return units
    .map((unit, index) =>
      equals(unit) &&
      (index === units.length - 1 || equals(units[index + 1]) || unit !== "=")
        ? "&#x3D;"
        : unit,
    )
    .join("");
}
