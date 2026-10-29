import { defaultHandlers } from "mdast-util-to-markdown";
import { balanceLabel } from "./autolink-literal-to-markdown.js";
import type { Options, State, Info } from "mdast-util-to-markdown";
import type { ImageReference, LinkReference, Parents } from "mdast";
import { decodeString } from "micromark-util-decode-string";

/** A label that is whitespace and nothing else. */
const BLANK = /^[ \t\n]+$/u;

/**
 * Write a whitespace-only shortcut reference as its own label, and delegate the rest.
 *
 * `mdast-util-to-markdown` collapses `[text][reference]` to `[text]` only when the two
 * spell the same thing. `text` arrives through `state.safe` and `reference` through
 * `associationId`, so a label the escaper touches makes them differ and the label gets
 * written twice: `[⏎ ]` over `[⏎ ]: /uri` came out as `[⏎&#x20;][⏎ ]`, a formatter
 * adding text nobody wrote.
 *
 * A whitespace-only label has no escaped spelling that survives a re-parse -- safe()
 * turns the space into `&#x20;` and a leading bracket into `\[`, and either way the
 * reference is gone on the next pass -- so writing it raw is the only faithful option.
 * It is safe precisely because the label holds nothing but whitespace: there is no `]`
 * or `\` in it to lose.
 *
 * Everything else delegates to `defaultHandlers.linkReference`, and that is the point.
 * Three attempts at reproducing upstream's branch inline each cost different cases:
 * collapsing every shortcut broke `link-reference-definitions/194` and `links/550`;
 * writing every label raw broke the same two differently; copying the branch with its
 * `tracker.move` calls broke three. `state.safe`, the tracker and the enter/exit stack
 * are order-sensitive, so the only reliable way to leave upstream's behaviour untouched
 * is to call upstream.
 */
/** Stands in for a spelled label while upstream writes the rest of the reference. */
const LABEL = "\uE00F";

/**
 * A full reference written with its label as the author spelled it, under `legacy`, where
 * remark-parse 8's adapter keeps that spelling (`data.spelledLabel`). The label is decoded, as
 * `mdast-util-from-markdown` reports it, but the identifier comes from the raw text, so writing
 * the decoded label changed the identifier: `[x][&amp;]` came back `[x][&]`, and `[x][^*em\*]`
 * `[x][^*em*]` (about 120 seeds of the million-seed census, under "formatting keeps the
 * tree"). The raw spelling cannot go through `state.safe`, which escaped it again on every pass
 * (`[ref\[]`), so upstream writes a placeholder and the spelling replaces it.
 */
function withSpelledLabel<T extends LinkReference | ImageReference>(
  node: T,
  write: (node: T) => string,
): string {
  const spelled = (node.data as { spelledLabel?: string } | undefined)
    ?.spelledLabel;
  if (
    spelled === undefined ||
    node.referenceType !== "full" ||
    decodeString(spelled) !== node.label
  ) {
    return write(node);
  }
  const written = write({ ...node, label: LABEL });
  return written.includes(LABEL)
    ? written.replace(LABEL, () => spelled)
    : write(node);
}

export function linkReferenceToMarkdown(
  options: { readonly strict?: boolean } = {},
): Options {
  return {
    handlers: {
      linkReference(
        node: LinkReference,
        parent: Parents | undefined,
        state: State,
        info: Info,
      ) {
        if (
          node.referenceType === "shortcut" &&
          BLANK.test(node.label ?? node.identifier)
        ) {
          const exit = state.enter("linkReference");
          const label = node.label ?? node.identifier;
          exit();
          return `[${label}]`;
        }
        const written = withSpelledLabel(node, (own) =>
          defaultHandlers.linkReference(own, parent, state, info),
        );
        return balanceLabel(node, state, written, options.strict);
      },
      imageReference(
        node: ImageReference,
        parent: Parents | undefined,
        state: State,
        info: Info,
      ) {
        return withSpelledLabel(node, (own) =>
          defaultHandlers.imageReference(own, parent, state, info),
        );
      },
    },
  };
}
