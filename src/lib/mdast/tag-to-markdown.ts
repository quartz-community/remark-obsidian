import type { Options } from "mdast-util-to-markdown";
import type { Parents } from "mdast";
import type { Tag } from "../types.js";
import { isTagCharacter } from "../tag-char.js";

/**
 * Ends a tag that emphasis, strong or strikethrough follows, under `legacy`, for the root writer
 * to remove. `mdast-util-to-markdown` encodes the character before attention whose content opens
 * with punctuation (`encodeInfo`, CommonMark's flanking rule), and that character was the tag's
 * own: `#tag*%%%%*` came back `#ta&#x67;*%%%%*`, a tag named `ta` (about 390 seeds of the
 * million-seed census, under "formatting keeps the tree"). remark-parse 8 needs no such
 * encoding, so the encoder is given this character to spend itself on instead. `strict` does
 * need it: `#tag*<https://e.test>*` opens no emphasis after a bare `g` (a census run with the
 * marker under both presets broke 4 seeds that way). U+2E7F ends a
 * tag (`isTagCharacter`), so no tag holds it, and `textToMarkdown` writes a literal one as a
 * decimal reference.
 */
const TAG_END = "\u2E7F";

/** `TAG_END`, encoded or not, before an attention marker. */
const TAG_END_PATTERN = /(?:\u2E7F|&#x2E7F;)(?=[*_~])/gu;

/** The written document with every `TAG_END` that follows a tag removed. */
export function removeTagEnds(written: string): string {
  return written.replace(TAG_END_PATTERN, (match: string, at: number) => {
    // Straight after `#` and tag characters: scanned back, the run ends at a `#`.
    let index = at - 1;
    while (index >= 0 && isTagCharacter(written[index]!)) index--;
    return index >= 0 && index < at - 1 && written[index] === "#" ? "" : match;
  });
}

export function tagToMarkdown(
  options: { readonly legacy?: boolean } = {},
): Options {
  return {
    // A `#` that is text must stay text: written bare, `x \\#tag` came back from a format as a
    // tag (found by `fuzz/invariant-sweep.ts`). Only where a tag could start, before a non-space:
    // after whitespace, at a line start, or after ASCII punctuation -- which the writer may itself
    // escape or encode, and an escape or a character reference counts as a construct a tag may
    // follow, so `](#tag` written `]\\(#tag` and `&amp;#a` written `\\&#a` both grew a tag. A `#`
    // after a letter or digit -- `page#section`, `C#` -- is left alone.
    unsafe: [
      {
        character: "#",
        before: "[\\s!-/:-@\\[-`{-~]",
        after: "[^\\s]",
        inConstruct: "phrasing",
      },
      {
        character: "#",
        atBreak: true,
        after: "[^\\s]",
        inConstruct: "phrasing",
      },
    ],
    // `#` after an escape or a character reference is `textToMarkdown`'s, which the rule above
    // cannot reach.
    handlers: {
      tag(node: Tag, parent: Parents | undefined) {
        const siblings = (parent?.children ?? []) as Array<{ type: string }>;
        const next = siblings[siblings.indexOf(node as never) + 1];
        // Strikethrough too: GFM writes it through the same attention encoder.
        const attention =
          next?.type === "emphasis" ||
          next?.type === "strong" ||
          next?.type === "delete";
        return `#${node.value}${options.legacy && attention ? TAG_END : ""}`;
      },
    },
  };
}
