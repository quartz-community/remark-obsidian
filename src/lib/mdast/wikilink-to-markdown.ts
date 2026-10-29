import type { Options, State } from "mdast-util-to-markdown";
import type { Parents } from "mdast";
// `tableCell` reaches `ConstructName` only through this package's declaration
// merging, so the augmentation has to be in scope here. `npm run typecheck`
// pulls it in transitively and passed without this; the `tsup` dts pass does
// not, which is why the build broke where the typecheck did not.
import type {} from "mdast-util-gfm-table";
import type { Wikilink } from "../types.js";
import { type SpelledTarget, writtenPart } from "../wikilink-target.js";

export function wikilinkToMarkdown(): Options {
  return {
    handlers: {
      wikilink(
        node: Wikilink,
        _parent: Parents | undefined,
        state: State,
      ): string {
        const prefix = node.embedded ? "!" : "";
        // The backslash before `]]` that resolving dropped from a part (`[[target\]]` links to
        // `target`) is the author's, so it goes back where it was.
        // And a part resolving rewrote (a no-break space, NFC) is written as the author spelled it.
        const data = node.data as
          ({ strippedBackslash?: string } & SpelledTarget) | undefined;
        const stripped = data?.strippedBackslash;
        const path = writtenPart(
          node.path,
          data?.spelledPath,
          stripped === "path",
        );
        const heading =
          node.heading || stripped === "heading"
            ? `#${writtenPart(node.heading, data?.spelledHeading, stripped === "heading")}`
            : "";
        // An alias written empty displays nothing, where none displays the target, so `[[a|]]`
        // keeps its `|`: written `[[a]]` it displayed `a`. Only it leaves a link to a target with
        // nothing to display.
        const writtenEmpty =
          !node.embedded &&
          node.value === "" &&
          (node.path !== "" || node.heading !== "");
        const alias = node.alias || writtenEmpty ? `|${node.alias}` : "";
        // An entirely empty wikilink needs its space back. `[[ ]]` parses as a wikilink
        // whose path is the empty string -- the inner text is trimmed as a whole -- but
        // `[[]]` does not parse as one at all, so writing that spelling loses the
        // construct: the next pass reads plain text and escapes it to `\[\[]]`, which
        // grows again every time. Five corpus documents never converged on this, and the
        // space is also what the author actually wrote.
        const body =
          path === "" && heading === "" && alias === ""
            ? " "
            : `${path}${heading}${alias}`;
        const written = `${prefix}[[${body}]]`;

        // A table cell ends at the first unescaped pipe, and this handler
        // builds its own string rather than going through `state.safe`, so
        // nothing else escapes the alias separator. Unescaped, the cell
        // `| [[Note|Alias]] |` becomes two cells when read back, and a second
        // formatting pass rewrites the row -- corrupting a table that holds
        // an aliased wikilink, which is ordinary content.
        return state.stack.includes("tableCell")
          ? written.replace(/\|/gu, "\\|")
          : written;
      },
    },
  };
}
