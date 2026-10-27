import type { Options, State, Info } from "mdast-util-to-markdown";
import type { Parents, Root, RootContent } from "mdast";
import type { Callout, CalloutTitle } from "../types.js";

/** A blockquote's own line prefix: `>` alone on a blank line, `> ` otherwise. */
const prefix = (line: string, _index: number, blank: boolean): string =>
  ">" + (blank ? "" : " ") + line;

/**
 * Serialise a callout back to the blockquote it came from.
 *
 * Every other construct this package adds ships a `toMarkdown` handler, but a
 * callout is produced by a transform rather than a syntax extension, so it had
 * none — and `mdast-util-to-markdown` throws `Cannot handle unknown node` on
 * any tree holding one. That made the whole package unserialisable for the
 * commonest Obsidian block, which is the path a formatter takes.
 *
 * The title is phrasing and belongs on the marker line; the body is flow and
 * follows on the next line, not after a blank one, so the two stay in the same
 * quote and the title does not re-parse as a paragraph of its own.
 */
export function calloutToMarkdown(): Options {
  return {
    handlers: {
      callout(
        node: Callout,
        _parent: Parents | undefined,
        state: State,
        info: Info,
      ) {
        const exit = state.enter("blockquote");
        const tracker = state.createTracker(info);
        tracker.move("> ");
        tracker.shift(2);

        const titleNode = node.children.find(
          (child): child is CalloutTitle => child.type === "calloutTitle",
        );
        const body = node.children.filter(
          (child) => child.type !== "calloutTitle",
        ) as RootContent[];

        const fold =
          node.collapsed === true ? "-" : node.collapsed === false ? "+" : "";
        // Phrasing needs the surrounding `before`/`after` as well as the
        // tracker's position, which `current()` alone does not carry.
        const title = titleNode
          ? state.containerPhrasing(titleNode, {
              ...info,
              ...tracker.current(),
            })
          : "";
        const head = `[!${node.calloutType}]${fold}${title ? ` ${title}` : ""}`;

        const rest =
          body.length > 0
            ? state.containerFlow(
                { type: "root", children: body } satisfies Root,
                tracker.current(),
              )
            : "";

        const value = state.indentLines(
          rest === "" ? head : `${head}\n${rest}`,
          prefix,
        );
        exit();
        return value;
      },

      calloutTitle(
        node: CalloutTitle,
        _parent: Parents | undefined,
        state: State,
        info: Info,
      ) {
        return state.containerPhrasing(node, info);
      },
    },
  };
}
