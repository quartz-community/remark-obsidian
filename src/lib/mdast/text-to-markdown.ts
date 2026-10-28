import { defaultHandlers, type Options } from "mdast-util-to-markdown";

/**
 * The text writer, registered whatever is on: its backslash repair applies to every document,
 * and the rest only where a `tag` can follow (`tags`).
 */
export function textToMarkdown(tags: boolean): Options {
  return {
    handlers: {
      // `tagToMarkdown`'s `unsafe` rule cannot reach a `#` right after a character the writer
      // escapes itself: `mdast-util-to-markdown` drops an escape conditioned on the previous
      // character whenever that character is being escaped, since in CommonMark the escape
      // neutralises it. Here an escape IS a construct a tag may follow, so `[[#a` written `\\[\\[#a` grew a tag. The
      // written text is checked instead: a bare `#` before a non-space, straight after an escape
      // or a character reference, is escaped too.
      text(node, parent, state, info) {
        // Matched left to right, so the second backslash of `\\\\` is never read as an escape.
        let written = defaultHandlers
          .text(node, parent, state, info)
          .replace(
            /(\\[!-/:-@[-`{-~]|&#?[\da-z]+;)(#(?=\S))?/giu,
            (_, construct: string, hash?: string) =>
              construct + (hash ? (tags ? "\\#" : hash) : ""),
          )
          // A literal backslash ending the text before whitespace: the writer may encode that
          // whitespace at an emphasis edge as `&#x20;`, and the backslash would then escape its
          // `&` (`*em**\\n \\ *` came back holding `#x20` as a tag). Escaped, it reads the same.
          .replace(/(?<!\\)((?:\\\\)*)\\(\s+)$/u, "$1\\\\$2");
        written = guardAmpersands(written);
        // A tag after a bracket pair (`a [x]#t`) stands because the pair is a construct to
        // Obsidian, defined or not. The writer escapes every `[` in text, which breaks the pair
        // and the tag with it. A pair the tree holds as TEXT was undefined -- a defined one would
        // be a reference node -- so writing its `[` bare reproduces the source. After a bare `^`
        // the escape moves to the `^` instead, or the pair becomes an inline footnote.
        const siblings = parent?.children ?? [];
        const next = siblings[siblings.indexOf(node as never) + 1];
        // A `^` before a footnote reference would open an inline footnote over it: `^[^blk]`.
        if (
          next?.type === "footnoteReference" &&
          /(?<!\\)(?:\\\\)*\^$/u.test(written)
        ) {
          written = `${written.slice(0, -1)}\\^`;
        }
        if (!tags) return written;
        // Whitespace alone before a tag at a line start (`[^1]:     #tag` keeps one space) is
        // encoded as a character reference, which a tag cannot follow. A line's leading
        // whitespace is not content, so it is left out.
        if (next?.type === "tag" && /^(?:&#x(?:20|9);)+$/iu.test(written)) {
          return "";
        }
        if (next?.type === "tag" && written.endsWith("]")) {
          const opener = written.lastIndexOf("\\[");
          if (opener !== -1 && !written.slice(opener + 2, -1).includes("]")) {
            const caret =
              written[opener - 1] === "^" && written[opener - 2] !== "\\";
            written = caret
              ? `${written.slice(0, opener - 1)}\\^${written.slice(opener + 1)}`
              : written.slice(0, opener) + written.slice(opener + 1);
          }
        }
        return written;
      },
    },
  };
}

/**
 * remark-parse 8 decodes a bare `&` followed by punctuation, anywhere after a character
 * reference in the same text, as that reference's character: `&#65; x &,` reads `A x A,`
 * (published rp8 too, so Obsidian's). The writer makes such references itself -- a line's
 * leading whitespace becomes `&#x20;` -- so ` &amp;, ` and `  $x^2$, &amp;, ` lost their `&` on
 * format (found by `fuzz/invariant-sweep.ts`). After a reference, or a line's leading whitespace,
 * such an `&` is escaped. One before them, or before a letter, digit, `#`, `<` or whitespace,
 * reads as itself and is left alone.
 */
function guardAmpersands(written: string): string {
  let armed = false;
  return written.replace(
    /(&#?[\da-z]+;)|((?:^|\n)[ \t]+)|(\\[\s\S])|&(?=[^\s\da-z#<])/giu,
    (match: string, reference?: string, leading?: string, escape?: string) => {
      if (reference || leading) {
        armed = true;
        return match;
      }
      if (escape) return match;
      return armed ? "\\&" : match;
    },
  );
}
