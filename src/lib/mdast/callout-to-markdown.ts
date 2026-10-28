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
/**
 * Blocks never written on an empty title's line, nor after a space there. A fence written there
 * never settled and indented code cannot be written there at all; a `%%` comment there took the
 * next comment's opener as its closer and grew a comment every format
 * (`probe/straddle/callout-comment`). Written below a bare marker, both read back as body.
 */
const NOT_ON_TITLE_LINE = new Set(["code", "comment"]);

/**
 * Blocks written below an empty title, after its space. `strict` reads the title line alone, so
 * a paragraph over lines written there lost its inline footnote, highlight, emphasis or code
 * span to the line break (`> [!note] ^[in` / `> inline]`, 7 seeds of the million-seed census).
 */
const BELOW_TITLE_LINE = new Set(["paragraph"]);

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
        // tracker's position, which `current()` alone does not carry. It also
        // needs the `phrasing` construct entered, as the paragraph handler does:
        // every escape the writer keys on it was skipped, so `*em\\*` and
        // `\\[[b]]` in a title came back as emphasis and a wikilink.
        let title = "";
        if (titleNode) {
          const exitPhrasing = state.enter("phrasing");
          title = state.containerPhrasing(titleNode, {
            ...info,
            ...tracker.current(),
          });
          exitPhrasing();
        }
        // A title node with nothing in it is a title written empty -- whitespace after the marker,
        // or a block on the title line (`> [!note] [^1]: def`) -- which displays nothing, where
        // no title displays the type. Its space is kept, or the next format read no title at all
        // (about 60 corpus documents failed "formatting keeps the tree" on that).
        const head = `[!${node.calloutType}]${fold}${
          title
            ? ` ${title}`
            : titleNode && !NOT_ON_TITLE_LINE.has(body[0]?.type ?? "")
              ? " "
              : ""
        }`;

        const rest =
          body.length > 0
            ? state.containerFlow(
                { type: "root", children: body } satisfies Root,
                tracker.current(),
              )
            : "";

        // An empty title over a definition was the definition written ON the title line, and that
        // is the one spelling both presets read back as it: remark-parse 8 makes no title of a
        // marker and a space alone.
        // Any block that stood there: both presets mark a title line holding a block with a title
        // node that has no children (`> [!note] <br>` too). Not code or a comment: see
        // `NOT_ON_TITLE_LINE`.
        const onTitleLine =
          titleNode !== undefined &&
          titleNode.children.length === 0 &&
          body.length > 0 &&
          !NOT_ON_TITLE_LINE.has(body[0]?.type ?? "") &&
          !BELOW_TITLE_LINE.has(body[0]?.type ?? "");
        const value = state.indentLines(
          rest === ""
            ? head
            : onTitleLine
              ? `${head}${rest}`
              : `${head}\n${rest}`,
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
        const exit = state.enter("phrasing");
        const value = state.containerPhrasing(node, info);
        exit();
        return value;
      },
    },
  };
}
