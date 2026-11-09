import { defaultHandlers } from "mdast-util-to-markdown";
import { balanceBrackets } from "./inline-footnote-to-markdown.js";
import { parentOf } from "./attention-to-markdown.js";
import type { Handle, Options, State } from "mdast-util-to-markdown";
import type { Link, LinkReference, Node, Parents, Text } from "mdast";

const MAILTO = "mailto:";

/** `atext` from RFC 5322, which CommonMark adopts for an email autolink's local part. */
const LOCAL = new Set(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.!#$%&'*+/=?^_`{|}~-",
);

const isAlphanumeric = (character: string): boolean =>
  (character >= "a" && character <= "z") ||
  (character >= "A" && character <= "Z") ||
  (character >= "0" && character <= "9");

/**
 * Whether CommonMark's own email-autolink grammar accepts this address.
 *
 * Written as a scan rather than a pattern because the grammar is three nested
 * repetitions -- labels within a domain, characters within a label -- and that shape
 * is a nested quantifier the ReDoS lint rejects outright.
 *
 * The asymmetry this exists to detect: the local part admits `_`, and a domain label
 * does not. GFM's literal-email state machine accepts `_` in the domain too, so
 * `a@b_c.com` is a link to GFM and not an address CommonMark would ever autolink.
 */
function isCommonMarkEmail(value: string): boolean {
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return false;

  for (const character of value.slice(0, at)) {
    if (!LOCAL.has(character)) return false;
  }

  for (const label of value.slice(at + 1).split(".")) {
    if (label.length === 0 || label.length > 63) return false;
    if (!isAlphanumeric(label[0] ?? "")) return false;
    if (!isAlphanumeric(label[label.length - 1] ?? "")) return false;
    for (const character of label) {
      if (!isAlphanumeric(character) && character !== "-") return false;
    }
  }

  return true;
}

/**
 * Whether GFM's literal-email state machine would match this address.
 *
 * Deliberately a separate test from CommonMark's rather than a tweak of it, because
 * the two grammars differ in both directions and only the overlap is safe to write
 * bare. GFM's domain admits `_` and `-` anywhere, needs a dot, and stops at trailing
 * punctuation -- so `a@b_c.com` and `a@b-.com` are links to GFM and addresses
 * CommonMark would never autolink.
 */
function isGfmLiteralEmail(value: string): boolean {
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return false;

  for (const character of value.slice(0, at)) {
    if (!LOCAL.has(character)) return false;
  }

  const domain = value.slice(at + 1);
  if (!domain.includes(".")) return false;
  if (!isAlphanumeric(domain[domain.length - 1] ?? "")) return false;

  for (const label of domain.split(".")) {
    if (label.length === 0) return false;
    for (const character of label) {
      if (
        !isAlphanumeric(character) &&
        character !== "-" &&
        character !== "_"
      ) {
        return false;
      }
    }
  }

  return true;
}

/**
 * A web address GFM's literal reads back whole, written bare: `https://` or `http://`, a domain
 * of letters, digits and `-` with a dot in it, then a path of characters no Obsidian or
 * CommonMark construct starts at, ending in a letter, a digit or `/`, so GFM trims nothing off
 * it. Conservative on purpose: anything else keeps `<...>`.
 */
const BARE_URL =
  /^https?:\/\/[a-z\d-]+(?:\.[a-z\d-]+)+(?:\/[\w\-./?#+:@=]*)?$/iu;

const isAttention = (node: Node | undefined): boolean =>
  node?.type === "emphasis" ||
  node?.type === "strong" ||
  node?.type === "delete";

const siblingsOf = (node: Node): Node[] =>
  (parentOf.get(node) as { children?: Node[] } | undefined)?.children ?? [];

/**
 * Whether `link`, a literal web address, opens attention and ends a line or a word, so that
 * written bare it re-parses to itself (`strict` only). `mdast-util-to-markdown` writes it
 * `<https://...>`, and attention whose content opens with that `<` needs a punctuation or a
 * space before its marker (CommonMark's flanking rule), so the writer encodes the character
 * before it. After a tag that character is the tag's own: `#tag*https://e.test/p*` came back
 * `#ta&#x67;*<https://e.test/p>*`, a tag named `ta`. Bare, the content opens with `h`.
 *
 * GFM's literal starts after a `*`, `_` or `~` and trims those off its end, so the closers
 * round it are safe; what follows them must be a line's end or whitespace, after any of the
 * punctuation GFM trims off a literal's end.
 */
function opensAttentionBare(link: Link, text: string): boolean {
  if (link.url !== text || !BARE_URL.test(text) || text.includes("==")) {
    return false;
  }
  const end = text.at(-1)!;
  if (!/[a-z\d/]/iu.test(end)) return false;
  // Opens attention: the first child at every level up to the outermost.
  let node: Node = link;
  let opens = false;
  for (;;) {
    const parent = parentOf.get(node);
    if (!isAttention(parent) || siblingsOf(node)[0] !== node) break;
    opens = true;
    node = parent!;
  }
  if (!opens) return false;
  // Then ends a word: closers only, up to whitespace or the end of the block.
  node = link;
  for (;;) {
    const siblings = siblingsOf(node);
    const next = siblings[siblings.indexOf(node) + 1];
    if (next) {
      if (next.type === "break") return true;
      if (next.type !== "text") return false;
      // Punctuation GFM trims off a literal's end, then a word's end.
      const rest = (next as Text).value.replace(/^[.,:;!?]+/u, "");
      if (rest !== "") return /^[ \t\n]/u.test(rest);
      node = next;
      continue;
    }
    const parent = parentOf.get(node);
    if (isAttention(parent)) {
      node = parent!;
      continue;
    }
    return (
      parent?.type === "paragraph" ||
      parent?.type === "heading" ||
      parent?.type === "tableCell"
    );
  }
}

/** The single text child of a link, when that is all it has. */
function soleText(node: Link): string | undefined {
  if (node.children.length !== 1) return undefined;
  const only = node.children[0];
  return only?.type === "text" ? only.value : undefined;
}

/**
 * A GFM autolink literal is written back as it was written, not wrapped in angles.
 *
 * `mdast-util-to-markdown` offers `<...>` shorthand whenever a link's text equals its
 * destination, checking the scheme but never whether CommonMark would actually
 * autolink that address (`format-link-as-autolink.js`). For an email whose domain
 * holds an underscore it will not: CommonMark's domain labels exclude `_` while GFM's
 * literal accepts it. So `write a@b_c.com now` is written `write <a@b_c.com> now`, and
 * re-parsing that is *not* an autolink -- the CommonMark attempt fails, GFM's literal
 * matches the address inside the angles, and the angles are left as text. Serialise
 * again and they are written around the link a second time:
 *
 *     write a@b_c.com now        source
 *     write <a@b_c.com> now      once
 *     write <<a@b_c.com>> now    twice
 *
 * Two characters per pass, without bound. Confirmed upstream behaviour at
 * `mdast-util-to-markdown@2.2.0`, which is current; it is unreported, and the fix
 * belongs in `formatLinkAsAutolink` validating a `mailto:` target against the
 * email-autolink grammar before offering the shorthand.
 *
 * Writing the address bare is the lossless repair rather than merely a converging one.
 * An address CommonMark rejects cannot have reached the tree through `<...>` in the
 * first place -- that would not have parsed as a link at all -- so the source held a
 * bare literal, and a bare literal is what re-parses to the identical node. The
 * alternative the ecosystem suggests, `[a@b_c.com](mailto:a@b_c.com)`, converges too
 * and rewrites the author's line into a resource link it never contained.
 *
 * Returned as a literal string deliberately. A handler's return value is appended
 * without passing through `state.safe`, which is the ecosystem's supported way to emit
 * content that must not be escaped -- `mdast-util-frontmatter`,
 * `mdast-util-math` and `mdast-util-mdx-expression` all do exactly this. `unsafe`
 * cannot express it: `configure` only ever appends entries, so an existing escape can
 * never be relaxed, and `state.safe` applies a backslash pass that no pattern governs.
 *
 * The bare form is only safe while the address cannot need escaping, so the local part
 * is checked against `atext` and the domain against its label rules; anything else
 * delegates to the default handler untouched.
 */
export function autolinkLiteralToMarkdown(
  options: { readonly strict?: boolean } = {},
): Options {
  return {
    handlers: {
      link(node: Link, parent: Parents | undefined, state: State, info) {
        const text = soleText(node);
        // Matched by GFM and rejected by CommonMark is the exact condition. It means
        // the source held a bare literal, since `<...>` would not have parsed as a
        // link, so the bare form re-parses to this very node. Anything outside that
        // overlap is left to the default handler.
        if (
          text !== undefined &&
          !node.title &&
          node.url === MAILTO + text &&
          !isCommonMarkEmail(text) &&
          isGfmLiteralEmail(text)
        ) {
          return text;
        }
        if (
          options.strict &&
          text !== undefined &&
          !node.title &&
          opensAttentionBare(node, text)
        ) {
          return text;
        }
        const written = (defaultHandlers.link as Handle)(
          node,
          parent,
          state,
          info,
        );
        return balanceLabel(node, state, written, options.strict);
      },
    },
  };
}

/**
 * The link text with its raw brackets balanced. remark-parse 8 finds the text's end by counting
 * raw brackets and stepping over escaped ones, and CommonMark requires raw brackets in link text
 * to balance, so under both presets a text the writer unbalanced lost its link. The writer
 * escapes brackets in text but not the ones a wikilink or a footnote label writes:
 * `[[[[target]]](link](u)` came back as `[[[[target]]\](link](u)` (legacy) and `[[^[[]]]](u)` as
 * `[[^[[]\]\]](u)` (strict with bare references), whose text never closes (found by
 * `fuzz/invariant-sweep.ts` and the million-seed census). A reference's text is the same
 * (`[[![[]]]][^x]`). The text is written again on its own, as the default handler writes it, to
 * find it in the output.
 */
export function balanceLabel(
  node: Link | LinkReference,
  state: State,
  written: string,
  strict = false,
): string {
  if (!written.startsWith("[")) return written;
  // Under `strict`, only text made of text and footnote references, as in `[[^[[]]]](u)`, where
  // an undefined call is brackets to micromark's link scan. A formula, a comment, a wikilink or
  // a link inside is one construct to it, whose brackets do not count: balanced as raw text,
  // `[^1 … [[[a#^blk]]](u)` and `[$$[^1\]$$](u)` lost their link (fuzz seed 46 and 104 seeds of
  // a fourth census).
  if (
    strict &&
    node.children.some(
      (child) => child.type !== "text" && child.type !== "footnoteReference",
    )
  ) {
    return written;
  }
  const exitLink = state.enter(node.type);
  const exitLabel = state.enter("label");
  const label = state.containerPhrasing(node, {
    before: "[",
    after: "]",
    now: { line: 1, column: 1 },
    lineShift: 0,
  });
  exitLabel();
  exitLink();
  if (!written.startsWith(`[${label}]`)) return written;
  return `[${balanceBrackets(label)}${written.slice(label.length + 1)}`;
}
