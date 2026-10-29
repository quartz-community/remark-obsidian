import type { Node } from "unist";
import { defaultHandlers, type Options } from "mdast-util-to-markdown";
import { parentOf } from "./attention-to-markdown.js";

/**
 * The text writer, registered whatever is on: its backslash repair applies to every document,
 * and the rest only where a `tag` can follow (`tags`).
 */
export function textToMarkdown(
  tags: boolean,
  highlights = false,
  legacy = false,
): Options {
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
        let written = escapeHashRuns(
          defaultHandlers.text(node, parent, state, info),
          tags,
        )
          // A literal backslash ending the text before whitespace: the writer may encode that
          // whitespace at an emphasis edge as `&#x20;`, and the backslash would then escape its
          // `&` (`*em**\\n \\ *` came back holding `#x20` as a tag). Escaped, it reads the same.
          .replace(/(?<!\\)((?:\\\\)*)\\(\s+)$/u, "$1\\\\$2");
        const siblingsOf = parent?.children ?? [];
        const afterBreak =
          siblingsOf[siblingsOf.indexOf(node as never) - 1]?.type === "break";
        // `legacy` only: to micromark, as to CommonMark, a no-break space is no blank line, and
        // under `strict` the reference `bareFootnoteRefs` finds before it did not survive the
        // encoding (`[^https://e.test/p]` over `⍽`).
        // A literal U+2E7F is the tag writer's end marker (`TAG_END`), so it is spelled as a
        // reference the root writer does not remove.
        written = written.replace(/\u2E7F/gu, "&#11903;");
        written = guardAmpersands(
          legacy ? guardBlankLines(written, afterBreak, info.after) : written,
        );
        // Not in a link's text that is its own address, an autolink literal: a URL's `=` is no
        // highlight, and escaped it put a backslash into the address (691 seeds of the second
        // million-seed census, `https://e.test/p====m`).
        const ownAddress =
          parent?.type === "link" &&
          parent.children.length === 1 &&
          (parent.url === node.value || parent.url === `mailto:${node.value}`);
        if (highlights && !ownAddress) written = guardEqualsRuns(written);
        // A `~~~` starting a line opens a fence once the line's indent is gone, and so does
        // strikethrough whose text starts with `~` (`~~` + `~~del` at a line start): ~155 seeds
        // of the million-seed census, `wor` / `········~~~~d` (legacy).
        written = written.replace(/(^|\n)~(?=~~)/gu, "$1\\~");
        const opensStrike =
          parent?.type === "delete" &&
          parent.children[0] === node &&
          written.startsWith("~");
        if (opensStrike) written = `\\${written}`;
        written = guardTildes(written, node as never, parent as never);
        // A tag after a bracket pair (`a [x]#t`) stands because the pair is a construct to
        // Obsidian, defined or not. The writer escapes every `[` in text, which breaks the pair
        // and the tag with it. A pair the tree holds as TEXT was undefined -- a defined one would
        // be a reference node -- so writing its `[` bare reproduces the source. After a bare `^`
        // the escape moves to the `^` instead, or the pair becomes an inline footnote.
        const siblings = parent?.children ?? [];
        const next = siblings[siblings.indexOf(node as never) + 1];
        // A `%%` straight after a comment: the writer's own `%` rule drops its escape there, the
        // comment's closing `%` being the same pattern, so `%%note%%` then the text `%%` / `x%%`
        // came back as a second comment (found by `fuzz/invariant-sweep.ts`).
        const previous = siblings[siblings.indexOf(node as never) - 1];
        if (previous?.type === "comment" && written.startsWith("%%")) {
          written = `\\${written}`;
        }
        // A reference opening a line, then `:`, is a definition's label once the line is written
        // where a definition can start: a paragraph's text `body text` / `[^note]: Definition`
        // (rule 1) came back as a second definition at the item's indent. Encoded, the colon
        // keeps the line text and the reference a reference.
        const beforeReference = siblings[
          siblings.indexOf(node as never) - 2
        ] as { type: string; value?: string } | undefined;
        if (
          previous?.type === "footnoteReference" &&
          written.startsWith(":") &&
          (beforeReference === undefined ||
            beforeReference.type === "break" ||
            (beforeReference.type === "text" &&
              /\n[ \t]*$/u.test(beforeReference.value ?? "")))
        ) {
          written = `&#x3A;${written.slice(1)}`;
        }
        // Straight after a tag, a `_`, `-` or `/` would continue it: the source escaped it
        // (`#tag\_under`), and the writer's own escape went with its `_` rule, which reads
        // `#tag_under` as one word (about 12 seeds of the million-seed census).
        if (previous?.type === "tag" && /^[_/-]/u.test(written)) {
          written = `\\${written}`;
        }
        // A `^` before anything written with a leading `[` would open an inline footnote over
        // it: `^[^blk]`, and `^[[[target\]]]` with a wikilink (found by `fuzz/invariant-sweep.ts`).
        const bracketed =
          next?.type === "footnoteReference" ||
          next?.type === "link" ||
          next?.type === "linkReference" ||
          (next?.type === "wikilink" &&
            !(next as { embedded?: boolean }).embedded);
        if (bracketed && /(?<!\\)(?:\\\\)*\^$/u.test(written)) {
          written = `${written.slice(0, -1)}\\^`;
        }
        if (!tags) return written;
        // A `#` opening the text right after punctuation the writer wrote outside it -- a link's
        // `[` -- loses its escape the same way: `[\\#tag](u)` came back with a tag in the link
        // (found by the million-seed census).
        if (
          /^#(?=\S)/u.test(written) &&
          /^[!-/:-@[-`{-~]$/u.test(info.before)
        ) {
          written = `\\${written}`;
        }
        // Whitespace alone before a tag at a line start (`[^1]:     #tag` keeps one space) is
        // encoded as a character reference, which a tag cannot follow. A line's leading
        // whitespace is not content, so it is left out.
        if (next?.type === "tag" && /^(?:&#x(?:20|9);)+$/iu.test(written)) {
          return "";
        }
        // So is whitespace opening emphasis or strong before a tag, which the attention writer
        // encodes as an edge (`**&#x9;#tag**`, about 50 seeds of the million-seed census).
        if (
          next?.type === "tag" &&
          /^[ \t]+$/u.test((node as { value: string }).value) &&
          (parent?.type === "emphasis" || parent?.type === "strong") &&
          parent.children[0] === node &&
          opensAfterSpace(parent as never)
        ) {
          return "";
        }
        // The pair may also close in a later text, across line breaks: `[^1` / `1]#tag` holds
        // `[^1`, a break, `1]` and the tag (found by the million-seed census).
        const closesLater = pairClosesBeforeTag(
          node as { value: string },
          siblings as never,
        );
        if (closesLater) {
          const opener = written.lastIndexOf("\\[");
          if (opener !== -1 && !written.slice(opener + 2).includes("]")) {
            written = written.slice(0, opener) + written.slice(opener + 1);
          }
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
 * A line of the text that holds only whitespace, some of it not a space or a tab, with its first
 * such character written as a reference. remark-parse 8 trims a line with JavaScript's `\s`, so
 * a line of a no-break space alone is a blank line to it and ends the paragraph: `1]` over
 * `····⍽` (U+00A0) held a break and a no-break space, kept by the indent the writer drops, and
 * came back as two paragraphs (about 460 seeds of the million-seed census). A line the text
 * shares with what is written before or after it is left alone, and so is its first line unless a
 * break ends the line above: a callout title's `⍽` is no line of its own, and `&#xA0;` there
 * read as no title at all.
 */
function guardBlankLines(
  written: string,
  afterBreak: boolean,
  after: string,
): string {
  const lines = written.split("\n");
  return lines
    .map((line, index) => {
      if (index === 0 && !afterBreak) return line;
      if (index === lines.length - 1 && after !== "\n" && after !== "") {
        return line;
      }
      if (!/^\s+$/u.test(line) || /^[ \t]+$/u.test(line)) return line;
      const at = line.search(/[^ \t]/u);
      const code = line.codePointAt(at)!;
      return `${line.slice(0, at)}&#x${code.toString(16).toUpperCase()};${line.slice(at + String.fromCodePoint(code).length)}`;
    })
    .join("\n");
}

/**
 * remark-parse 8 decodes a bare `&` followed by punctuation, anywhere after a character
 * reference in the same text, as that reference's character: `&#65; x &,` reads `A x A,`
 * (published rp8 too, so Obsidian's). The writer makes such references itself -- a line's
 * leading whitespace becomes `&#x20;` -- so ` &amp;, ` and `  $x^2$, &amp;, ` lost their `&` on
 * format (found by `fuzz/invariant-sweep.ts`). After a reference, or a line's leading whitespace,
 * such an `&` is escaped. One before them, or before a letter, digit, `#`, `<` or ASCII
 * whitespace, reads as itself and is left alone. A no-break space is not whitespace to
 * remark-parse 8 here: `  &amp;⍽` (U+00A0) lost its `&` (45 seeds of a million-seed census).
 */
function guardAmpersands(written: string): string {
  let armed = false;
  return written.replace(
    /(&#?[\da-z]+;)|((?:^|\n)[ \t]+)|(\\[\s\S])|&(?=[^ \t\r\n\da-z#<])/giu,
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

/**
 * A run of `=` written so no pair in it opens a highlight. The writer escapes the first `=` of a
 * pair but drops the escape on the next one, the character before it being escaped already, so
 * `======` came back `\\===\\===`, whose `==` pairs opened a highlight (132 seeds of the
 * million-seed census, under both presets). Every `=` with another `=` and then a non-space
 * after it is escaped; the last pair of a run, before whitespace or the end, opens nothing.
 */
function guardEqualsRuns(written: string): string {
  const units = written.match(/\\[\s\S]|[\s\S]/gu) ?? [];
  for (let index = 0; index < units.length; index++) {
    if (units[index] !== "=" || units[index + 1] !== "=") continue;
    const after = units[index + 2];
    if (after !== undefined && !/^\s$/u.test(after)) units[index] = "\\=";
  }
  return units.join("");
}

/**
 * Whether `node`'s last `[` is closed by a later text, reached through text and line breaks
 * only, whose first `]` ends it straight before a tag: the bracket pair a tag stands on, split
 * over lines.
 */
function pairClosesBeforeTag(
  node: { value: string },
  siblings: Array<{ type: string; value?: string }>,
): boolean {
  const open = node.value.lastIndexOf("[");
  if (open === -1 || node.value.includes("]", open)) return false;
  for (
    let index = siblings.indexOf(node as never) + 1;
    index < siblings.length;
    index++
  ) {
    const sibling = siblings[index]!;
    if (sibling.type === "break") continue;
    if (sibling.type !== "text") return false;
    const value = sibling.value ?? "";
    if (value.includes("[")) return false;
    const close = value.indexOf("]");
    if (close === -1) continue;
    return close === value.length - 1 && siblings[index + 1]?.type === "tag";
  }
  return false;
}

/**
 * Whether `node` starts its parent's content or follows whitespace, so whitespace inside its
 * start is no word boundary of its own: `g**⇥#tag**` without the tab would read `g#tag`.
 */
function opensAfterSpace(node: Node): boolean {
  const siblings = (parentOf.get(node) as { children?: Node[] } | undefined)
    ?.children;
  if (!siblings) return false;
  const before = siblings[siblings.indexOf(node) - 1] as
    { type: string; value?: string } | undefined;
  if (!before) return true;
  return before.type === "break" || /\s$/u.test(before.value ?? "");
}

/**
 * A `~` touching a strikethrough's delimiters, written as `&#x7E;`. remark-parse 8 scans for the
 * closer on raw characters, as for a highlight's, so an escape does not hide a `~` from it:
 * `~del~~. ~~~~` (a strikethrough holding `. ~`) came back closed one character early (about
 * 60 seeds of the million-seed census). Inside one, a `~` before another or at either end; beside
 * one, a `~` against it.
 */
function guardTildes(
  written: string,
  node: { type: string },
  parent: { type: string; children: Array<{ type: string }> } | undefined,
): string {
  const siblings = parent?.children ?? [];
  const index = siblings.indexOf(node);
  const inside = parent?.type === "delete";
  const afterStrike = siblings[index - 1]?.type === "delete";
  const beforeStrike = siblings[index + 1]?.type === "delete";
  if (!inside && !afterStrike && !beforeStrike) return written;
  const units = written.match(/\\[\s\S]|&#?[\da-z]+;|[\s\S]/giu) ?? [];
  const tilde = (unit: string | undefined) => unit === "~" || unit === "\\~";
  const last = units.length - 1;
  units.forEach((unit, at) => {
    if (!tilde(unit)) return;
    const touches =
      (inside &&
        (tilde(units[at + 1]) ||
          (at === last && index === siblings.length - 1) ||
          (at === 0 && index === 0))) ||
      (afterStrike && at === 0) ||
      (beforeStrike && at === last);
    if (touches) units[at] = "&#x7E;";
  });
  return units.join("");
}

/**
 * A bare `#` before a non-space, straight after an escape or a character reference, escaped
 * too -- until none is left. Each `#` escaped is an escape the next one follows, so a run comes
 * out alternating in one pass: the writer's `\\###\\###anim` became `\\#\\##\\#\\##anim`, whose last
 * `#` started a tag (found by the stricter round-trip check, "formatting keeps the tree").
 * Matched left to right, so the second backslash of `\\\\` is never read as an escape.
 */
function escapeHashRuns(written: string, tags: boolean): string {
  if (!tags) return written;
  for (let previous = ""; previous !== written;) {
    previous = written;
    written = written.replace(
      /(\\[!-/:-@[-`{-~]|&#?[\da-z]+;)(#(?=\S))?/giu,
      (_, construct: string, hash?: string) => construct + (hash ? "\\#" : ""),
    );
  }
  return written;
}
