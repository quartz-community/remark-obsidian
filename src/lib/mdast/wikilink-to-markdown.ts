import type { Options, State } from "mdast-util-to-markdown";
import type { Parents } from "mdast";
import type { Wikilink } from "../types.js";

export function wikilinkToMarkdown(): Options {
  return {
    handlers: {
      wikilink(
        node: Wikilink,
        _parent: Parents | undefined,
        state: State,
      ): string {
        const prefix = node.embedded ? "!" : "";
        const heading = node.heading ? `#${node.heading}` : "";
        const alias = node.alias ? `|${node.alias}` : "";
        const written = `${prefix}[[${node.path}${heading}${alias}]]`;

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
