/**
 * Our side of the comparison.
 *
 * Obsidian-specific constructs are projected from **mdast**, not HTML, because
 * producing correct mdast nodes is what remark-obsidian is responsible for.
 * Turning a `wikilink` node into an anchor is `obsidian-flavored-markdown`'s job,
 * so asserting on rendered anchors here would test the wrong package — and would
 * fail for a reason that is not a parity bug.
 */

import { load } from "js-yaml";
import { decodeNamedCharacterReference } from "decode-named-character-reference";
import type { Root } from "mdast";
import type { Node } from "unist";
import { SKIP, visit } from "unist-util-visit";
import { applyTextTransform, parseOurs, type ProfileName } from "./chain.js";
import type {
  ComputedMeta,
  LinkItem,
  MetaProjections,
  MathItem,
  Projections,
  SectionItem,
  TaskItem,
} from "./types.js";

interface WikilinkNode extends Node {
  type: "wikilink";
  path: string;
  heading: string;
  alias: string;
  embedded: boolean;
  value: string;
}

interface ValueNode extends Node {
  value: string;
}

interface ListItemNode extends Node {
  type: "listItem";
  checked?: boolean | null;
  data?: { taskChar?: string };
}

interface HeadingNode extends Node {
  type: "heading";
  depth: number;
}

interface ImageNode extends Node {
  type: "image";
  url?: string;
}

interface LinkNode extends Node {
  type: "link";
  url?: string;
}

const isType = <T extends Node>(node: Node, type: string): node is T =>
  node.type === type;

/** Text descendants, with hard breaks kept so a multi-line highlight compares. */
/**
 * The twelve pictographs Obsidian 1.14 reads as a highlight's colour: the six
 * rainbow circles and the six rainbow squares. Closed rather than sampled --
 * both families were probed in full, and brown, black and white are not
 * markers in either.
 */
const COLOUR_MARKERS = new Set([
  0x1f534, 0x1f7e0, 0x1f7e1, 0x1f7e2, 0x1f535, 0x1f7e3, 0x1f7e5, 0x1f7e7,
  0x1f7e8, 0x1f7e9, 0x1f7e6, 0x1f7ea,
]);

/**
 * Drop a leading colour marker, as 1.14 does when it parses one.
 *
 * By **codepoint**, not grapheme: `==🔴\uFE0F text==` consumes the circle and
 * leaves the variation selector orphaned at the front of the content, which a
 * grapheme-aware strip would swallow too. Only the first is taken, so the
 * second of two survives, and whatever whitespace followed stays -- the marker
 * is removed, not the separator.
 *
 * This belongs to the projection and never to the tree. Obsidian drops the
 * character when rendering while the file keeps it, so reproducing the drop in
 * a node value would let a formatter delete the author's emoji -- the same rule
 * that keeps an undefined footnote reference and a surplus table cell intact.
 */
function stripColourMarker(content: string): string {
  const first = content.codePointAt(0);
  if (first === undefined || !COLOUR_MARKERS.has(first)) return content;
  return content.slice(String.fromCodePoint(first).length);
}

/**
 * Resolve character references the way a browser does when it parses raw HTML.
 *
 * An `html` node holds its source verbatim, so `<div>` over `&amp;` still carries
 * the four characters `&amp;`. Obsidian hands that string to the DOM, which decodes
 * it, and the `textContent` the recorder reads is therefore `&`.
 *
 * `decodeNamedCharacterReference` is micromark's own table, so the names resolve
 * exactly as the parser resolves them elsewhere. An out-of-range code point becomes
 * U+FFFD, which is what Obsidian reports for `&#87654321;`.
 */
function decodeEntities(value: string): string {
  return value.replace(
    /&(?:#(\d{1,7})|#[Xx]([\dA-Fa-f]{1,6})|([A-Za-z][\dA-Za-z]{1,31}));/gu,
    (whole: string, decimal?: string, hex?: string, name?: string): string => {
      // An unknown name gives `false`, not `undefined`, so `??` would keep it.
      if (name !== undefined) {
        const named = decodeNamedCharacterReference(name);
        return named === false ? whole : named;
      }
      const code = Number.parseInt(
        (decimal ?? hex)!,
        decimal === undefined ? 16 : 10,
      );
      if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return "\uFFFD";
      }
      return String.fromCodePoint(code);
    },
  );
}

/**
 * Display text with whitespace kept exactly as written.
 *
 * `mdastText` ends in `.replace(/\s+/g, " ").trim()`, which is right for comparing
 * against a DOM `textContent` but destroys the only thing the 1.14 highlight rules
 * turn on: `==🔴\ttext==` keeps its tab, `==🔴\ntext==` keeps its line ending, and
 * the space after a colour marker survives. Switching the highlight projection to
 * `mdastText` fixed 8 cases and broke 20 for exactly that reason.
 *
 * So the node-type handling is deliberately duplicated from `mdastText` rather than
 * shared: the two agree on what each node *shows* and disagree on whitespace, and
 * that disagreement is the point.
 */
function textOf(node: Node, defined?: ReadonlySet<string>): string {
  let out = "";

  const walk = (child: Node): void => {
    switch (child.type) {
      case "text":
      case "inlineCode":
        out += (child as ValueNode).value;
        return;
      case "break":
        out += "\n";
        return;
      case "wikilink": {
        const link = child as WikilinkNode;
        out += link.embedded
          ? link.heading
            ? `${link.path}#${link.heading}`
            : link.path
          : link.value ||
            link.alias ||
            [link.path, link.heading].filter(Boolean).join(" > ");
        return;
      }
      case "tag":
        out += `#${(child as ValueNode).value}`;
        return;
      case "inlineMath":
        out += "\u27e8math\u27e9";
        return;
      // Renders nothing, and it carries its parsed body as children.
      case "comment":
        return;
      // Same rule as `mdastText`: a reference nothing defines is shown by
      // Obsidian as its bare label, and the DOM side reads that text too.
      case "footnoteReference": {
        const id = String(
          (child as unknown as { identifier: string }).identifier,
        );
        if (defined && !defined.has(id)) out += id;
        return;
      }
      // An inline note renders as a marker here too, so its body is not part of
      // the surrounding construct: `# ==^[inline]==` reports the highlight as
      // `⟨fn⟩`, where walking the children reported `inline`. Without this case the
      // body leaks into whichever construct encloses it, since the default below
      // descends into it.
      case "footnote":
        out += "\u27e8fn\u27e9";
        return;
      default:
        break;
    }

    const children = (child as { children?: Node[] }).children;
    if (children) for (const grandchild of children) walk(grandchild);
  };

  walk(node);
  return out;
}

/** Once inside one of these, no descendant is a block boundary. */
const PHRASING_HOSTS = new Set([
  "paragraph",
  "heading",
  "tableCell",
  "calloutTitle",
]);

const BLOCK_TYPES = new Set([
  "callout",
  "calloutTitle",
  "paragraph",
  "heading",
  "listItem",
  "blockquote",
  "code",
  "math",
  "table",
  "tableRow",
  "tableCell",
  "thematicBreak",
  "html",
  "footnoteDefinition",
]);

/** Identifiers the document defines, so a reference can be told from bare text. */
export function definedFootnotes(tree: Node): Set<string> {
  const defined = new Set<string>();
  visit(tree, (node: Node) => {
    // A definition written inside a `%%` comment does not define. Measured:
    // `%%` / `[^1]: buried` / `%%` / `text[^1] ref` renders `text1 ref`, the
    // bare label of an *undefined* reference. The asymmetry is Obsidian's --
    // a reference inside a comment is still indexed by `metadataCache`, while
    // a definition inside one binds nothing.
    if (node.type === "comment") return SKIP;
    if (node.type === "footnoteDefinition") {
      defined.add(
        String((node as unknown as { identifier: string }).identifier),
      );
    }
    return;
  });
  return defined;
}

/**
 * `$$…$$` written inline, marked so the `break` beside it can be dropped.
 *
 * The NUL is a marker, not output: it is stripped before the text is returned, so
 * display and inline math still compare identically. Reusing the plain placeholder
 * here instead made the check fire for *every* inline formula, which cost 11 cases.
 */
const DISPLAY_INLINE_MATH = "\u27e8math\u27e9\u0000";

/** Labels the document defines, so a dangling reference can be told from a live one. */
export function definedReferences(tree: Node): Set<string> {
  const defined = new Set<string>();
  visit(tree, "definition", (node: Node) => {
    defined.add(String((node as unknown as { identifier: string }).identifier));
  });
  return defined;
}

/**
 * A formula as Obsidian hands it to MathJax, with a no-break space entity-encoded.
 *
 * Measured from `data-latex`: `$⟨nbsp⟩x⟨nbsp⟩$` is reported as the literal six
 * characters `&nbsp;` either side of the `x`, and the stored html agrees --
 * `data-latex="&amp;nbsp;x&amp;nbsp;"` is the escaped spelling of that string, so this
 * is Obsidian's own encoding and not the recorder's. The tree keeps U+00A0 because
 * that is what the source holds; only the projection speaks the renderer's dialect.
 *
 * Encoding here rather than relaxing the comparison's trim is what makes it work at
 * all: `alignMath` trims the formula's edges, and `String.prototype.trim` counts
 * U+00A0 as whitespace, so a raw no-break space at either end is removed from our
 * side before the two are ever compared. As `&nbsp;` it is no longer trimmable.
 *
 * U+00A0 alone, because that is the only character the corpus can adjudicate: it
 * holds exactly one formula containing one, and none containing a raw `&`, `<` or
 * `>`. Widening to those would be a guess dressed as a rule.
 */
function renderedTex(value: string): string {
  return value.replaceAll("\u00a0", "&nbsp;");
}

/**
 * Whether Obsidian would resolve this destination against the vault.
 *
 * A colon **anywhere** marks it external, not merely a leading scheme. That is
 * measured rather than assumed: `[link](foo\)\:)` is a link to `foo):` in both our
 * tree and Obsidian's, and Obsidian renders it `class="external-link"` -- so the
 * recorder, which captures `a.internal-link`, reports no link where a leading-scheme
 * test reported one. Across the corpus no internal link's destination holds a colon,
 * and every `mailto:` and `https://` one already did.
 *
 * Note this is a *classification* question and not a resolution one. Obsidian's real
 * answer depends on the vault -- `b.md` and `/uri` are external in the recording while
 * `#fragment` is internal -- and the harness has no vault to consult, so the test only
 * has to agree with the recording on the cases the corpus holds. It does, on all 500.
 */
const isVaultTarget = (url: string): boolean =>
  url !== "" && !url.includes(":") && !url.startsWith("//");

/**
 * Whether an unescaped `[` is still open at `at`, counting from `from`.
 *
 * This is what licenses a `]` run *after* an escaped-bracket block identifier. With no
 * closers behind it the identifier always registers, but `\[^1]` registers nothing
 * while `[[\[^1]` and `[\[^1]]]` both do -- the trailing `]` has to be answering an
 * opener that is still outstanding. Presence is not enough:
 * `# ![[[[link](u)]]](\[^1]` has four openers before the identifier and all of them
 * are already closed, so it registers nothing too.
 *
 * Escaped brackets are skipped on both sides, since a `\[` opens nothing and a `\]`
 * closes nothing. Counted over the block rather than the line, which
 * `[^[[a#` / `\[^1]` is what settles: its closer answers an opener one line up.
 */
function bracketStillOpen(source: string, from: number, at: number): boolean {
  let depth = 0;
  for (let index = from; index < at; index++) {
    const character = source[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "[") depth += 1;
    else if (character === "]" && depth > 0) depth -= 1;
  }
  return depth > 0;
}

/**
 * A `[` straight after a balanced `]` is a label opener and is not rendered.
 *
 * `[foo][ref[]` renders `[foo]ref[]`: the bracket after the closer opens a label, and
 * the label is shown bare because nothing defines it. Measured across both label
 * shapes, defined and undefined, and with a destination for the first pair --
 * `[foo][ref[bar]]` gives `[foo]ref[bar]]`, `see [foo][ref[] end` gives
 * `see [foo]ref[] end`, and `[foo][ref[]` over `[foo]: /other` resolves the first pair
 * to a link and still shows `ref[]`.
 *
 * The closer must balance to depth zero, which `[ref[][]` is what forces: its `]`
 * closes an inner `[` while the outer one is still open, so no label opens and Obsidian
 * renders the whole run. Same balance test the escaped block identifier needed, for the
 * same reason -- a bracket only closes a label if it was the label's own.
 *
 * Downstream by the governing rule rather than by preference. Obsidian *drops* this
 * character, and a drop belongs in the projection: removing it from a node value would
 * let a formatter delete a bracket the author wrote, which is the same reasoning that
 * keeps a dangling footnote reference and a surplus table cell in the tree.
 */
function dropLabelOpeners(value: string): string {
  let out = value;
  for (let at = out.length - 1; at >= 1; at--) {
    if (out[at] !== "[" || out[at - 1] !== "]") continue;
    // Through the closer itself, so the depth read is the one *after* it: in
    // `[foo][ref[]` the `]` closes the only opener and the next `[` is a label's,
    // while in `[ref[][]` it closes an inner one and the outer is still waiting.
    let depth = 0;
    for (let scan = 0; scan < at; scan++) {
      const character = out[scan];
      if (character === "\\") {
        scan += 1;
        continue;
      }
      if (character === "[") depth += 1;
      else if (character === "]" && depth > 0) depth -= 1;
    }
    if (depth > 0) continue;
    out = out.slice(0, at) + out.slice(at + 1);
  }
  return out;
}

/** Nodes whose children are a label, where a bracket is content and opens nothing. */
const LABEL_HOSTS = new Set([
  "link",
  "linkReference",
  "image",
  "imageReference",
]);

/**
 * Whether Obsidian's parser would accept this as an html comment.
 *
 * remark-parse@8 keeps CommonMark 0.28's restriction and micromark dropped it, which is
 * the whole difference: the body may not contain `--`, may not start with `>` or `->`,
 * and may not end with `-`. An invalid one is not a comment at all, so Obsidian renders
 * it as visible text -- `foo <!-- a -- b --> bar` reads in full.
 *
 * Confirmed against the arbiter rather than inferred. The note on
 * `commonmark/raw-html/625` had claimed this needed "an unbounded scan on `<`" and
 * quoted a quadratic cost for it; the rule is a check on the node's own body and
 * `foo <!-- a -- b --> bar` is literal on one line, so line-spanning was never
 * involved either.
 */
function isRealComment(raw: string): boolean {
  if (!raw.startsWith("<!--") || !raw.endsWith("-->") || raw.length < 7) {
    return false;
  }
  const body = raw.slice(4, -3);
  return (
    !body.startsWith(">") &&
    !body.startsWith("->") &&
    !body.includes("--") &&
    !body.endsWith("-")
  );
}

/** A tag opens on `<` plus a letter, `/`, `!` or `?`; any other `<` is literal text. */
const TAG_START = /[a-zA-Z/!?]/;

/**
 * Tags removed as an HTML tokenizer removes them, leaving only the visible text.
 *
 * Two rules a `<[^>]*>` pattern cannot express:
 *
 * - A `>` inside a quoted attribute value does not close the tag. So
 *   `<a bam='baz <em>"</em>'` continued onto a second line ending `/>` is **one**
 *   element and renders nothing; stopping at the first `>` leaks the attribute tail
 *   as text. As a regex the quote rule needs a nested quantifier --
 *   `(?:[^>"']|"[^"]*"|'[^']*')*` -- which the ReDoS lint rejects, hence a scanner.
 * - That quote rule holds for a **tag only**. `<!` and `<?` enter the bogus-comment
 *   state, which has no notion of attributes and ends at the first `>` whatever
 *   quotes enclose it. `<?php` / `echo '>';` / `?>` is the case that discriminates:
 *   the bogus comment ends inside the PHP string literal, so `'; ?>` is visible
 *   text and Obsidian reports it. Honouring quotes there swallows the block whole.
 * - An unterminated tag takes the remainder of the value with it, because a
 *   tokenizer reaching end-of-input mid-tag emits nothing and the browser discards
 *   it along with everything it swallowed.
 */
function stripTags(raw: string): string {
  let out = "";
  let at = 0;

  while (at < raw.length) {
    if (raw[at] !== "<" || !TAG_START.test(raw[at + 1] ?? "")) {
      out += raw[at];
      at += 1;
      continue;
    }

    const marker = raw[at + 1];
    const quotesApply = marker !== "!" && marker !== "?";
    let cursor = at + 2;
    let quote = "";
    let closed = false;
    while (cursor < raw.length) {
      const code = raw[cursor];
      if (quote !== "") {
        if (code === quote) quote = "";
      } else if (quotesApply && (code === '"' || code === "'")) {
        quote = code;
      } else if (code === ">") {
        cursor += 1;
        closed = true;
        break;
      }
      cursor += 1;
    }

    at = cursor;
    if (!closed) break;
  }

  return out;
}

/** From mdast, not HTML: `wikilink`/`tag` have no hast handler and vanish when rendered. */
export function mdastText(
  tree: Node,
  defined?: ReadonlySet<string>,
  source?: string,
  /**
   * Whether the walk starts *inside* a link label.
   *
   * `emphasis` calls this on an emphasis node directly, so the walk begins below any
   * enclosing `linkReference` and cannot see it -- and inside a label a bracket is
   * content rather than a label opener. `commonmark/links/533` is what measures it:
   * `[foo *bar [baz][ref]*][ref]` reports the emphasis as `bar [baz][ref]`, brackets
   * and all.
   */
  startsInLabel = false,
): string {
  const parts: string[] = [];
  const references = source === undefined ? undefined : definedReferences(tree);

  const strip = (value: string): string => value.replace(/\u0000/gu, "");

  /**
   * A `%%` comment that never closes, read from its own source slice.
   *
   * The node's value cannot answer this: an unclosed comment and one closed around
   * the same body both hold that body. The slice can -- `%%` and `%%note` carry no
   * closer, while `%%x%%` and `%%%%` do, so a closer is a trailing `%%` with at least
   * four characters to sit in.
   */
  const unclosedComment = (candidate: Node): boolean => {
    if (source === undefined) return false;
    // Through the last child, because the hiding propagates outwards. At one level
    // `> %%` absorbs its lazy line and `- %%` leaves the comment as a direct sibling,
    // both already handled; at two, `> > %%` over `em*` leaves `em*` beside the inner
    // *blockquote* rather than beside the comment. A container whose last descendant
    // is an unclosed comment is itself unclosed for this purpose.
    if (candidate.type !== "comment") {
      const kids = (candidate as { children?: Node[] }).children;
      const last = kids?.[kids.length - 1];
      return last !== undefined && unclosedComment(last);
    }
    const from = candidate.position?.start?.offset;
    const to = candidate.position?.end?.offset;
    if (from === undefined || to === undefined) return false;
    const slice = source.slice(from, to);
    return !(slice.length >= 4 && slice.endsWith("%%"));
  };
  const walk = (
    node: Node,
    phrasing = false,
    inLabel = startsInLabel,
  ): void => {
    switch (node.type) {
      case "text":
        // Not inside a link label, where nothing parses and both brackets stay:
        // `[foo [bar][ref]](u)` renders `foo [bar][ref]`, so the inner `[` is
        // content there rather than a label opener. Three cases measure it.
        parts.push(
          inLabel
            ? (node as ValueNode).value
            : dropLabelOpeners((node as ValueNode).value),
        );
        return;
      // A code span is literal, so its brackets are content and no label opens in it.
      case "inlineCode":
        parts.push((node as ValueNode).value);
        return;
      case "wikilink": {
        const link = node as WikilinkNode;
        // `value` is the display form the parser resolved, which can differ from
        // `path`: `[[target\]]` resolves to `target` but shows `target\`.
        parts.push(
          link.embedded
            ? // An unresolved embed shows the target as written, fragment and
              // all: `![[Document.pdf#page=3]]` reads `Document.pdf#page=3`,
              // where a plain link would read only its path.
              link.heading
              ? `${link.path}#${link.heading}`
              : link.path
            : // `??`, not `||`: an empty `value` is a written empty alias and
              // renders as nothing, so falling through to the path would show
              // a target Obsidian hides.
              (link.value ??
                link.alias ??
                [link.path, link.heading].filter(Boolean).join(" > ")),
        );
        return;
      }
      case "tag":
        parts.push(`#${(node as ValueNode).value}`);
        return;
      // A `%%` comment renders nothing. It carries its body parsed as children
      // as well as text now, so returning here is what keeps that body out of
      // the rendered projection -- without it the comment's own contents are
      // walked and appear as visible text.
      case "comment":
        return;
      case "inlineMath":
        // `data.display`, not `display`: `mathDisplayTransform` writes the flag
        // into `data` alongside the hast properties, which is where `math[].display`
        // reads it from too.
        //
        // The marker is pushed only for math starting in column 1, because that is
        // what decides whether the `break` beside it survives. `$$y^2$$` over `word`
        // reads `⟨math⟩word`, while `··$$y^2$$` over `··[[` reads `⟨math⟩ [[` -- five
        // unindented cases drop the separator and both indented ones keep it. Indented
        // display math therefore takes the plain placeholder, which is identical once
        // the marker is stripped and leaves the line ending to speak for itself.
        parts.push(
          (node as unknown as { data?: { display?: boolean } }).data
            ?.display === true && node.position?.start?.column === 1
            ? DISPLAY_INLINE_MATH
            : "\u27e8math\u27e9",
        );
        return;
      case "math":
        parts.push("\u27e8math\u27e9 ");
        return;
      case "code":
        parts.push(`${(node as ValueNode).value} `);
        return;
      case "html": {
        // A comment Obsidian's parser rejects is not a comment, so it renders in
        // full. Emitted before the strips below, because every one of them would
        // otherwise treat it as markup and hide it.
        {
          const raw = (node as ValueNode).value;
          // Closed but invalid only. An *unclosed* comment still hides everything
          // it swallowed -- `html/unclosed-comment-plain` and seven others measure
          // that -- so it must keep going through the strips below.
          if (
            raw.startsWith("<!--") &&
            raw.endsWith("-->") &&
            !isRealComment(raw)
          ) {
            // With the whitespace micromark dropped in front of it. The comment scan
            // runs to the LAST `-->` on the line, so `foo <!--> foo -->` arrives as
            // one html node spanning `<!--> foo -->` with the space at offset 3
            // belonging to no node at all -- text ends at 3 and html starts at 4.
            // Obsidian renders `foo <!--> foo -->`, so the space has to come back,
            // and it comes from the source rather than being assumed.
            const at = node.position?.start?.offset;
            let gap = "";
            if (at !== undefined && source !== undefined) {
              let back = at;
              while (
                back > 0 &&
                (source[back - 1] === " " || source[back - 1] === "\t")
              ) {
                back -= 1;
              }
              gap = source.slice(back, at);
            }
            const previous = parts[parts.length - 1];
            if (typeof previous === "string" && /[ \t]$/u.test(previous)) {
              gap = "";
            }
            parts.push(`${gap}${raw}${phrasing ? "" : " "}`);
            return;
          }
        }
        // Obsidian's textContent has no markup, so compare inner text only. The
        // trailing space is the block separator every other block type gets from
        // BLOCK_TYPES below, which this early return would otherwise skip.
        //
        // A raw-text element contributes nothing: Obsidian sanitises `script`
        // and friends out of reading view, so their content is not in the
        // rendered text at all, and stripping only the tags would surface a
        // body no renderer shows.
        const raw = (node as ValueNode).value
          .replace(
            /<(script|style|textarea|title)\b[\s\S]*?(?:<\/\1\s*>|$)/gi,
            " ",
          )
          // A comment renders nothing, and an unclosed one swallows the rest
          // of the note. Tag-stripping alone leaves its body behind, because
          // `<!--` has no `>` for that pattern to match.
          .replace(/<!--[\s\S]*?(?:-->|$)/g, " ");
        // A tag contributes nothing to `textContent`, so it is removed rather
        // than separated: `a<br>b` reads `ab`. Replacing one with a space
        // invented a word boundary the DOM has no equivalent for.
        //
        // Only a `<` that really opens a tag is removed, which is what keeps
        // `<![CDATA[>&<]]>` honest: HTML5 has no CDATA in content, so a browser
        // reads `<![CDATA[>` as a bogus comment ending at the first `>` and shows
        // the rest, `&<]]>`, as text. Note that none of this is a parse question --
        // micromark takes the whole CDATA span as one html node and the arbiter
        // agrees, so the drop is downstream by construction.
        parts.push(`${decodeEntities(stripTags(raw))}${phrasing ? "" : " "}`);
        return;
      }
      // A reference whose label nothing defines renders as its own source, brackets
      // and all: Obsidian shows `[foo]` where walking the children shows `foo`.
      // Taken as a source slice rather than rebuilt, because the written form
      // varies by reference type and may hold escapes -- `[bar][foo\!]` has to come
      // back exactly, and reconstructing it from `identifier` would unescape it.
      //
      // Same class as a dangling footnote reference, which `rehype-obsidian`
      // already bares: the node stays in the tree so a formatter cannot delete the
      // author's brackets, and the drop belongs downstream.
      case "linkReference": {
        const reference = node as unknown as { identifier: string };
        const from = node.position?.start?.offset;
        const to = node.position?.end?.offset;
        if (
          references === undefined ||
          source === undefined ||
          from === undefined ||
          to === undefined ||
          references.has(String(reference.identifier))
        ) {
          break;
        }
        parts.push(source.slice(from, to));
        return;
      }
      case "break":
        // Nothing after display math that began in column 1. `$$y^2$$` over `word`
        // reads `⟨math⟩word` in Obsidian with no separator at all, where every other
        // line ending in a paragraph reads as one -- the rendered math is a
        // block-level element, so the `<br>` beside it contributes nothing to
        // `textContent`. Indented display math is not that element and keeps its
        // separator, which is why the marker is only pushed for column 1; the test
        // here reads the marker rather than re-deciding it.
        if (parts[parts.length - 1] === DISPLAY_INLINE_MATH) return;
        parts.push("\n");
        return;
      // Obsidian resolves a relative image path against the vault and renders it
      // as an internal embed, which the recorder reduces to its `src`. An
      // absolute URL stays an ordinary external image.
      case "image": {
        const url = (node as { url?: string }).url ?? "";
        if (isVaultTarget(url)) {
          parts.push(url);
        }
        return;
      }
      // Obsidian shows the callout's title, defaulting a missing one to the
      // capitalised type (`> [!warning]` reads "Warning"). A present title lives
      // in a `calloutTitle` child, so walking the children emits it.
      // 1.14 consumes a leading colour marker, so neither the rendered text nor
      // the highlight's own content holds it. Stripped after the children are
      // walked, which keeps every other construct inside the highlight -- a
      // wikilink, math, a bare reference -- handled exactly as it is elsewhere.
      case "highlight": {
        const mark = parts.length;
        for (const child of (node as unknown as { children: Node[] })
          .children) {
          walk(child, phrasing, inLabel);
        }
        const first = parts[mark];
        if (typeof first === "string") parts[mark] = stripColourMarker(first);
        return;
      }
      case "callout": {
        const callout = node as unknown as {
          calloutType: string;
          children?: Node[];
        };
        const children = callout.children ?? [];
        if (!children.some((c) => c.type === "calloutTitle")) {
          // Humanised, not merely capitalised: `[!NOTE]` reads "Note" and
          // `[!project-status]` reads "Project status", so the rest is
          // lowercased and hyphens become spaces.
          const type = callout.calloutType.toLowerCase().replace(/-/gu, " ");
          parts.push(`${type.charAt(0).toUpperCase()}${type.slice(1)} `);
        }
        for (const child of children) walk(child, phrasing, inLabel);
        parts.push(" ");
        return;
      }
      // Counterpart to the recorder dropping `section.footnotes`: the renderer
      // relocates every definition body to the document end, so comparing them
      // in source position would diverge on placement alone.
      case "footnoteDefinition":
        return;
      // Obsidian renders the marker as `[n]`, other renderers as `n`. A
      // placeholder on both sides compares "a reference is here" without
      // comparing renderer styling, the same way math is handled.
      //
      // Unless nothing defines it: Obsidian consumes the delimiters anyway and
      // shows the bare label, so `see [^x]` reads `see x` with no marker. The
      // node still carries the reference -- dropping it is the renderer's doing,
      // not the parser's -- so the drop belongs here, in the projection.
      case "footnoteReference": {
        const id = String(
          (node as unknown as { identifier: string }).identifier,
        );
        parts.push(defined && !defined.has(id) ? id : "\u27e8fn\u27e9");
        return;
      }
      case "footnote":
        parts.push("\u27e8fn\u27e9");
        return;
      // An email autolink shows the address without its scheme: Obsidian
      // renders `<mailto:a@e.test>` as `a@e.test`, while `<https://x>` keeps
      // `https://` -- measured, and only `mailto:` is dropped.
      case "link": {
        const link = node as unknown as { url?: string; children?: Node[] };
        const url = link.url ?? "";
        const children = link.children ?? [];
        const only = children.length === 1 ? children[0] : undefined;
        // A label that is only a footnote marker renders as nothing. `[^1](u)` is
        // an internal link to `u` whose anchor comes back **empty** --
        // `<a class="internal-link" data-href="u"></a>` -- so the `^1` is consumed
        // and never drawn, which is the same answer `probe/reference-in-link/*`
        // already recorded for a reference inside a link: it survives almost
        // nowhere. The node keeps its text, so a formatter cannot lose the
        // characters; only the rendering drops them.
        //
        // Undefined only. `[^1](u)` with a `[^1]:` definition parses differently --
        // a real `footnoteReference` followed by the literal `(u)` -- and never
        // reaches here.
        if (
          only?.type === "text" &&
          FOOTNOTE_ONLY_LABEL.test((only as ValueNode).value)
        ) {
          return;
        }
        if (
          only &&
          only.type === "text" &&
          (only as ValueNode).value === url &&
          MAILTO_PREFIX.test(url)
        ) {
          parts.push(url.slice("mailto:".length));
          return;
        }
        break;
      }
      default:
        break;
    }

    const children = (node as { children?: Node[] }).children;
    const inner = phrasing || PHRASING_HOSTS.has(node.type);
    const label = inLabel || LABEL_HOSTS.has(node.type);
    if (children) {
      for (const child of children) {
        walk(child, inner, label);
        // A comment with no closer hides its following *siblings* as well as its own
        // body. Usually it absorbs what follows -- `a` / `%%` / `b` arrives as a
        // comment spanning `b`, so skipping the node is enough -- but inside a list
        // item a `===` line lands beside it instead: `1. %%note` / `===` leaves
        // `comment "note"` and a sibling paragraph, and Obsidian renders nothing for
        // either. Our `sections` already agree with its `list@0:0-1:3`, so the
        // structure was right and only this projection was wrong.
        if (unclosedComment(child)) break;
      }
    }
    if (!phrasing && BLOCK_TYPES.has(node.type)) parts.push(" ");
  };

  walk(tree);
  return strip(parts.join("")).replace(/\s+/g, " ").trim();
}

/** Counterpart to Obsidian's `sections`. Offsets index the *transformed* source we parsed. */
/**
 * Back an offset up to the start of its line.
 *
 * mdast puts a block's start *after* its leading indentation, while Obsidian's
 * section offsets begin at the line, so `   # H` compared as `# H` and reported
 * a divergence for a heading both sides had parsed identically.
 */
function lineStartOf(source: string, offset: number): number {
  const newline = source.lastIndexOf("\n", offset - 1);
  const start = newline + 1;
  return source.slice(start, offset).trim() === "" ? start : offset;
}

export function mdastSections(tree: Root, source: string): SectionItem[] {
  const out: SectionItem[] = [];
  let consumed = 0;
  for (const child of tree.children) {
    const start = child.position?.start?.offset;
    const end = child.position?.end?.offset;
    if (start === undefined || end === undefined) continue;
    // Clamp to the previous block's end. A setext heading preceded by a link
    // reference definition carries a position that starts back at the
    // definition, so `[ref]: /url\npara\n===` reported the heading as all three
    // lines where Obsidian reports only the two it owns.
    const from = Math.max(lineStartOf(source, start), consumed);
    consumed = Math.max(consumed, end);
    out.push({
      type: child.type,
      text: source.slice(from, end).replace(/^\n+/, "").replace(/\n+$/, ""),
    });
  }
  return out;
}

/**
 * The heading name as `metadataCache.headings[].heading` reports it: the raw
 * source between the marker and any closing sequence, with inline markup left
 * intact (`# **a**` is `**a**`, `# [[target]]` is `[[target]]`).
 *
 * Sliced from the source rather than walked, because walking cannot reproduce it —
 * the markup has already been consumed into nodes, and a `wikilink` or `inlineMath`
 * child would contribute nothing at all. Slicing also makes this assert the
 * heading's own position, which nothing else here does.
 */
export function headingName(node: Node, source: string): string {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (start === undefined || end === undefined) return "";
  const raw = source.slice(start, end);
  // `[ \t]*$` as well as `[ \t]+`, or an empty heading never matches at all and
  // falls through to the setext branch below, which then reports its own marker:
  // `#` was named `#` and `## ⏎#⏎### ###` named its middle heading `#`.
  const atx = /^#{1,6}(?:[ \t]+|[ \t]*$)/.exec(raw);
  if (atx)
    return (
      raw
        .slice(atx[0].length)
        // A closing sequence has to be *preceded by whitespace*, or be the whole
        // content, and an escaped run is not one at all. Stripping `#*$`
        // unconditionally renamed `# foo#` to `foo` and `### foo \###` to `foo \`,
        // neither of which Obsidian or CommonMark does.
        .replace(/(?:^|[ \t]+)#+[ \t]*$/, "")
        .trim()
    );
  // Setext: the underline is inside the node's span but outside its name. Inside a
  // container the slice keeps the block prefix, so `para\n> ===` must lose the
  // whole final line, marker included.
  const underlined = raw.replace(/\r?\n[ \t]*(?:>[ \t]*)*[=-]+[ \t]*$/, "");
  // A heading keeps a trailing block identifier, always. There used to be a strip
  // here with a carve-out for the case where it ate everything, because `^blk\n---`
  // is named `^blk`; the carve-out was the clue that the rule was wrong rather than
  // incomplete. `Setext heading ^setext-id\n---` is named in full, and removing the
  // strip fixes that while leaving every other case alone -- 1 case gained, 0 lost.
  const body = underlined;
  // A setext heading shares its content chunk with any link reference
  // definitions above it, so its span starts back at them: `[ref]: /url\npara\n===`
  // reports a heading named `para`, not `[ref]: /url\npara`.
  const lines = body.split("\n");
  while (lines.length > 1 && /^ {0,3}\[[^\]]*\]:/.test(lines[0] ?? "")) {
    lines.shift();
  }
  return lines.join("\n").trim();
}

/**
 * An internal destination as `data-href` reports it: path and subpath apart, and
 * percent-decoded.
 *
 * A wikilink arrives already split by the tokenizer, but `[x](a.md#^b)` does not,
 * and Obsidian resolves it the same way -- the recorder captures both as
 * `a.internal-link`. Reporting the raw destination named the whole of `a.md#^b` as
 * the path and left the heading empty, so a block reference written in the ordinary
 * link syntax looked like a parse divergence.
 *
 * Split before decoding, so a `%23` in a path cannot invent a subpath that the
 * author did not write. `decodeURIComponent` throws on a malformed escape, and a
 * lone `%` is ordinary in a filename, so the raw text stands in when it does.
 */
function splitTarget(url: string): { path: string; heading: string } {
  const hash = url.indexOf("#");
  const path = hash === -1 ? url : url.slice(0, hash);
  const heading = hash === -1 ? "" : url.slice(hash + 1);
  return { path: percentDecode(path), heading: percentDecode(heading) };
}

function percentDecode(value: string): string {
  if (!value.includes("%")) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function projectMdast(
  tree: Root,
  source: string,
  options: {
    readonly skipUnreferencedDefinitions?: boolean;
    readonly skipComments?: boolean;
    readonly writtenTargets?: boolean;
  } = {},
): Omit<Projections, "text" | "sections"> {
  const skipUnreferenced = options.skipUnreferencedDefinitions ?? true;
  const skipComments = options.skipComments ?? true;
  // Off for the compared `links` projection, which is matched structurally
  // against Obsidian's DOM and would see this as a surplus key. Only the cache
  // cares how the target was written.
  const writtenTargets = options.writtenTargets ?? false;
  const math: MathItem[] = [];
  const defined = definedFootnotes(tree);
  /** Every node under a footnote definition or an inline footnote. */
  const inFootnote = new Set<Node>();
  visit(tree, (node: Node) => {
    if (node.type !== "footnoteDefinition" && node.type !== "footnote") return;
    visit(node, (inner: Node) => {
      inFootnote.add(inner);
    });
  });
  /** Every node under a link label, where a bracket is content. */
  const inLabelNode = new Set<Node>();
  visit(tree, (node: Node) => {
    if (!LABEL_HOSTS.has(node.type)) return;
    visit(node, (inner: Node) => {
      inLabelNode.add(inner);
    });
  });
  /** The last definition for each label, which is the one Obsidian renders. */
  const lastDefinition = new Map<string, Node>();
  visit(tree, "footnoteDefinition", (node: Node) => {
    lastDefinition.set(
      String((node as unknown as { identifier: string }).identifier),
      node,
    );
  });
  const referenced = new Set<string>();
  visit(tree, "footnoteReference", (node: Node) => {
    referenced.add(
      String((node as unknown as { identifier: string }).identifier),
    );
  });

  const links: LinkItem[] = [];
  /**
   * Links whose node sits inside an inline footnote, kept apart until the end.
   *
   * Obsidian relocates an inline footnote's body to a trailing section, and
   * `metadataCache` indexes it there -- so `^[... ![[d.pdf]] ...] ... ![[img.png]]`
   * reports `img.png` first even though `d.pdf` is written earlier on the line. A
   * single in-order walk cannot produce that, so the two buckets are concatenated.
   *
   * Inline footnotes only. A `footnoteDefinition` is already written at the end of a
   * document in every recorded case, so hoisting one would reorder nothing and the
   * six matching controls here cannot tell the two rules apart -- which is reason to
   * implement the one that is measured rather than the one that sounds symmetrical.
   */
  const relocated: LinkItem[] = [];
  /** Definitions the walk skipped, whose inline footnotes are rendered anyway. */
  const skipped: Node[] = [];
  /** Every node under an inline footnote, whose body the renderer moves. */
  const inInlineNote = new Set<Node>();
  visit(tree, (node: Node) => {
    if (node.type !== "footnote") return;
    visit(node, (inner: Node) => {
      inInlineNote.add(inner);
    });
  });
  const tags: string[] = [];
  const headings: string[] = [];
  const tasks: TaskItem[] = [];
  const highlights: string[] = [];
  const emphasis: string[] = [];

  visit(tree, (node: Node) => {
    // Nothing inside a `%%` comment renders, so nothing inside one reaches a
    // *rendered* projection. The body is parsed into children now, and without
    // this a wikilink or a tag written inside a comment would be collected as
    // though the document displayed it.
    //
    // `metadataCache` is the other half of that asymmetry and indexes the
    // comment's contents anyway, so it clears this flag: `%%[[target]]%%`
    // reports a link to `target` while rendering nothing at all. The same split
    // already governs footnote references.
    if (skipComments && node.type === "comment") return SKIP;
    // An unreferenced definition is never rendered, so nothing inside it
    // reaches the capture. A referenced one is rendered into
    // `section.footnotes`: the recorder drops that for `text`, which is why
    // `mdastText` skips definitions wholesale, but its math and links are
    // still collected from the document. So the skip here is conditional on
    // the reference, not on the node.
    if (node.type === "footnoteDefinition") {
      const id = String((node as unknown as { identifier: string }).identifier);
      if (skipUnreferenced && !referenced.has(id)) {
        skipped.push(node);
        return SKIP;
      }
      // Duplicates: only the LAST definition for a label is rendered. The recorded
      // html for `fuzz/embed/46` shows it -- `[^1]: > [!note] ![[[[word]]]]` over
      // `[^1]: - [^1]` renders `<li data-footnote-id="fn-1">` holding the *second*
      // definition's list, so the first one's embed never appears and Obsidian
      // indexes no link. We collected from both and reported the discarded one.
      if (skipUnreferenced && lastDefinition.get(id) !== node) {
        skipped.push(node);
        return SKIP;
      }
    }
    // `mdastText`, not `textOf`, so a wikilink or math span inside the emphasis
    // yields the same display text the DOM side reads off the rendered element.
    if (node.type === "strong" || node.type === "emphasis") {
      // Not inside a footnote, for the reason given at the `highlight` branch
      // above: the recorder reads `text`, `highlights` and `emphasis` off a clone
      // with `.footnotes` removed, because the renderer relocates every footnote
      // body to a trailing section.
      if (inFootnote.has(node)) return;
      const kind = node.type === "strong" ? "strong" : "em";
      emphasis.push(
        `${kind}:${mdastText(node, defined, undefined, inLabelNode.has(node))}`,
      );
      return;
    }
    if (isType<WikilinkNode>(node, "wikilink")) {
      const from = node.position?.start?.offset;
      const to = node.position?.end?.offset;
      // Read off the source, because an empty fragment and an absent one both
      // leave `heading` empty. Only the target matters here, so the alias is cut
      // at the first `|` and the inner text is trimmed as a whole, exactly as the
      // parser splits it.
      const written =
        from === undefined || to === undefined
          ? ""
          : source
              .slice(from, to)
              .replace(/^!?\[\[/, "")
              .replace(/\]\]$/, "")
              .trim()
              .split("|")[0]!;
      (inInlineNote.has(node) ? relocated : links).push({
        path: node.path,
        heading: node.heading,
        embedded: node.embedded,
        ...(writtenTargets && node.heading === "" && written.endsWith("#")
          ? { emptyFragment: true }
          : {}),
      });
      return;
    }
    if (isType<ImageNode>(node, "image")) {
      const url = node.url ?? "";
      if (isVaultTarget(url)) {
        (inInlineNote.has(node) ? relocated : links).push({
          ...splitTarget(url),
          embedded: true,
        });
      }
      return;
    }
    // Same resolution as the image above, one step along: Obsidian resolves a
    // relative markdown destination against the vault and renders `[x](url)`
    // as an internal link, which the recorder captures like a wikilink. An
    // absolute URL stays an ordinary external link and is not a vault link.
    if (isType<ImageNode>(node, "link")) {
      const url = node.url ?? "";
      if (isVaultTarget(url)) {
        (inInlineNote.has(node) ? relocated : links).push({
          ...splitTarget(url),
          embedded: false,
        });
      }
      // Children still walk: a wikilink or tag can sit inside the label.
    }
    if (node.type === "tag") {
      tags.push((node as ValueNode).value);
      return;
    }
    if (node.type === "highlight") {
      // Same reason as `emphasis` below: read off the clone, which has `.footnotes`
      // removed, so a highlight inside a footnote body is one Obsidian cannot
      // report. `math`, `links`, `tags`, `headings` and `tasks` come from the
      // undisturbed root and are not restricted this way.
      if (inFootnote.has(node)) return;
      highlights.push(stripColourMarker(textOf(node, defined)));
      return;
    }
    if (node.type === "inlineMath") {
      const display = Boolean(
        (node as { data?: { display?: boolean } }).data?.display,
      );
      math.push({ display, tex: renderedTex((node as ValueNode).value) });
      return;
    }
    if (node.type === "math") {
      math.push({ display: true, tex: renderedTex((node as ValueNode).value) });
      return;
    }
    if (isType<HeadingNode>(node, "heading")) {
      headings.push(`${node.depth}:${headingName(node, source)}`);
      return;
    }
    if (isType<ListItemNode>(node, "listItem")) {
      if (node.checked === null || node.checked === undefined) return;
      tasks.push({
        char: node.data?.taskChar ?? (node.checked ? "x" : " "),
        checked: node.checked,
      });
    }
  });

  // An inline footnote is self-referencing: the renderer relocates its body to the
  // trailing section and shows it even when the definition around it is never
  // rendered. `fuzz/embed/22` is the case -- `[^1]: - ![[[[a|b]]]]](^[[[a#h]]]` has
  // no reference anywhere, so the definition is skipped and its own `![[[[a|b]]]]`
  // never appears, while the `a#h` inside the inline footnote does.
  //
  // Collected in a second pass rather than by not skipping, because the definition's
  // *own* content must stay suppressed -- letting the walk through would report the
  // `[a` the recording does not have. Only links, because that is the projection the
  // relocation reaches; the text and emphasis projections read a clone with the
  // footnotes section removed, so nothing there is expected either way.
  for (const definition of skipped) {
    visit(definition, (node: Node) => {
      if (node.type !== "footnote") return;
      visit(node, (inner: Node) => {
        if (isType<WikilinkNode>(inner, "wikilink")) {
          relocated.push({
            path: inner.path,
            heading: inner.heading,
            embedded: inner.embedded,
          });
          return;
        }
        if (inner.type === "image" || inner.type === "link") {
          const url = (inner as unknown as { url?: string }).url ?? "";
          if (isVaultTarget(url)) {
            relocated.push({
              ...splitTarget(url),
              embedded: inner.type === "image",
            });
          }
        }
      });
    });
  }

  return {
    math,
    links: [...links, ...relocated],
    tags,
    headings,
    tasks,
    highlights,
    emphasis,
  };
}

interface ParentNode extends Node {
  children: Node[];
}

/**
 * GFM 4.10 discards an over-long row's excess cells when *rendering*, so mdast
 * keeps every cell it parsed while `mdast-util-to-hast` truncates. Obsidian's
 * side is read off the DOM, so without matching that truncation the retained
 * cells read as a parser divergence where both sides actually agree.
 */
function alignTableCells(tree: Root): Root {
  visit(tree, "table", (table: Node) => {
    const rows = (table as ParentNode).children;
    // The delimiter row declares the columns, so `align` is the count to
    // truncate to. It only differs from the header when the delimiter runs
    // short, which Obsidian renders as the narrower table while the tree
    // keeps every cell it parsed.
    const declared = (table as { align?: unknown[] }).align?.length;
    const columns =
      declared ?? (rows[0] as ParentNode | undefined)?.children.length;
    if (columns === undefined) return;
    for (const row of rows) {
      const cells = (row as ParentNode).children;
      if (cells.length > columns) cells.length = columns;
    }
  });
  return tree;
}

/**
 * Our side of `metadataCache`, the oracle recorded alongside every golden and
 * until now never compared. It is independent of the DOM: Obsidian builds it
 * from its own parse rather than from what the renderer produced, so it can
 * disagree with the rendered text and catch what a text projection cannot.
 *
 * `link` and `embed` are one string, the target with its fragment appended,
 * which is how the cache spells them -- `[[a#b#c|d]]` is recorded as `a#b#c`,
 * alias dropped. A reference nothing defines is absent entirely, matching the
 * cache, and so is an inline `^[...]`, which the cache does not treat as a
 * reference.
 */
export function metaOurs(tree: Root, source: string): MetaProjections {
  // The cache indexes the source, so a definition nothing references is still
  // indexed -- unlike the rendered text, where it never appears.
  const projected = projectMdast(tree, source, {
    skipUnreferencedDefinitions: false,
    skipComments: false,
    writtenTargets: true,
  });
  const defined = definedFootnotes(tree);
  const target = (link: LinkItem): string =>
    link.heading === ""
      ? `${link.path}${link.emptyFragment === true ? "#" : ""}`
      : `${link.path}#${link.heading}`;

  // Only a resolved `[^x]`, never a `[^x]` nothing defines. An inline `^[...]`
  // is not a reference either -- with one exception, measured rather than
  // assumed: an *empty* one is recorded with an empty name. `^[] and ^[x]`
  // reports a reference named `""` beside a definition named `[inline1`, so the
  // empty body is both indexed and counted.
  const footnotes: string[] = [];
  visit(tree, (node: Node) => {
    if (node.type === "footnoteReference") {
      const id = String((node as unknown as { identifier: string }).identifier);
      if (defined.has(id)) footnotes.push(id);
      return;
    }
    // `footnote` is the inline form. Nothing inside one is indexed, so the
    // subtree is skipped rather than walked.
    //
    // Emptiness is read from the source between `^[` and `]`, not from the
    // node's children: a whitespace-only body produces no children either, yet
    // `^[ ]` is a *definition* to the cache (`[inline0`) while only a truly
    // empty `^[]` becomes the empty-named reference.
    if (node.type === "footnote") {
      const start = node.position?.start?.offset;
      const end = node.position?.end?.offset;
      const body =
        start === undefined || end === undefined
          ? ""
          : source.slice(start + 2, end - 1);
      if (body === "") footnotes.push("");
      return SKIP;
    }
    // Obsidian indexes the text inside a `%%` comment: a reference written
    // there is recorded even though nothing renders it. Our tree keeps the
    // comment as one opaque value, so the references have to be read out of
    // it rather than walked.
    if (node.type !== "comment") return;
    const value = String((node as unknown as { value: string }).value);
    for (const match of value.matchAll(/\[\^([^[\]\s]+)\]/gu)) {
      const id = match[1]!.toLowerCase();
      if (defined.has(id)) footnotes.push(id);
    }
    // The body is also parsed into children, so walking on would find the same
    // references a second time through their real nodes.
    return SKIP;
  });

  // Only the document's own headings. Obsidian renders one inside a container
  // -- `> # Foo` paints a heading, and so does `- $x` over `===` -- but does
  // not index it, which four independent cases agree on while every indexed
  // heading sits at the top level, indented or not.
  const topLevel: string[] = [];
  for (const child of tree.children) {
    const node = child as Node;
    if (!isType<HeadingNode>(node, "heading")) continue;
    topLevel.push(`${node.depth}:${headingName(node, source)}`);
  }

  return {
    headings: topLevel,
    links: projected.links.filter((l) => !l.embedded).map(target),
    embeds: projected.links.filter((l) => l.embedded).map(target),
    tags: projected.tags,
    footnotes,
  };
}

/**
 * `^id` at the end of a block.
 *
 * Alphanumerics and hyphens only, which is narrower than the `[^\s^]+` a
 * permissive reading suggests, and the corpus is what narrowed it: Obsidian
 * keeps `x ^a_b` as text, so an underscore is not a block identifier at all.
 * The tight class also keeps the pattern off `^[`, which opens an inline
 * footnote -- the first attempt ate `^[[note]` and three other footnote cases.
 */
const TRAILING_BLOCK_ID = /(?:^|[ \t])\^[A-Za-z0-9-]+$/u;
const ONLY_BLOCK_ID = /^[ \t]*\^[A-Za-z0-9-]+[ \t]*$/u;
/**
 * The same identifier behind a bracket, which only counts when the bracket is escaped.
 *
 * `\[^1` renders `[`, so the caret is a block identifier; `[^1` renders in full,
 * because there the bracket opens a footnote reference that claims the caret. The two
 * are indistinguishable in a node's value and differ by one character in the source,
 * so the caller checks the span rather than the text.
 *
 * Closing brackets may follow the identifier and are kept: `[[\[^1]` renders `[[[]`
 * and `[\[^1]]]` renders `[[]]]`, so only the `^1` goes. That is why the identifier is
 * captured separately instead of the whole match being sliced off, and why this is not
 * anchored the way `TRAILING_BLOCK_ID` is -- four cases carry a `]` run behind it.
 */
const BRACKETED_BLOCK_ID = /\[(\^[A-Za-z0-9-]+)\]*$/u;
/**
 * A `mailto:` scheme in any case, which Obsidian strips from the displayed text.
 *
 * `<MAILTO:FOO@BAR.BAZ>` renders `FOO@BAR.BAZ` exactly as `<mailto:a@e.test>` renders
 * `a@e.test` -- the recorded html shows the prefix gone from the anchor text and kept
 * in the href for both. A case-sensitive `startsWith` matched only the lowercase one.
 */
const MAILTO_PREFIX = /^mailto:/iu;

/** A link label that is nothing but a footnote marker. */
const FOOTNOTE_ONLY_LABEL = /^\^[A-Za-z0-9-]+$/u;

/**
 * Drop block identifiers before projecting.
 *
 * `^block-id` is an anchor, not content: Obsidian renders neither the trailing
 * form `A paragraph. ^id` nor the standalone one, where a `^id` on its own
 * line names the block above it and produces no block of its own.
 *
 * The tree keeps it, which is the same split used for an undefined footnote
 * reference and a surplus table cell -- the source said `^id`, so removing it
 * from the tree would let a formatter delete an anchor other notes link to.
 * `rehype-obsidian` strips it when rendering, and this mirrors that so the
 * comparison measures the parse rather than the anchor.
 */
/** A node's start or end offset, if it has one. */
function pointOf(
  node: Node | undefined,
  which: "start" | "end",
): number | undefined {
  return (
    node as
      | {
          position?: { start?: { offset?: number }; end?: { offset?: number } };
        }
      | undefined
  )?.position?.[which]?.offset;
}

/** Whether the next sibling block begins on the line straight after this one. */
function adjacentBlockFollows(
  children: readonly Node[],
  index: number,
  source: string,
): boolean {
  const here = pointOf(children[index], "end");
  const next = pointOf(children[index + 1], "start");
  if (here === undefined || next === undefined) return false;
  return !source.slice(here, next).includes("\n\n");
}

/** Inline wrappers an identifier scan reads straight through. */
const ID_WRAPPERS = new Set(["emphasis", "strong", "delete", "highlight"]);

/**
/**
 * The node actually holding a trailing identifier, descending through wrappers.
 *
 * Returns the children array to read the last text from, plus the chain of
 * wrappers walked, innermost first, so an emptied one can be pruned afterwards.
 */
/** Whether a host candidate's last text node actually ends in an identifier. */
function hostHasIdentifier(host: { inner: Node[]; chain: unknown[] }): boolean {
  const last = host.inner[host.inner.length - 1];
  if (!last || last.type !== "text") return false;
  const value = (last as ValueNode).value;
  return TRAILING_BLOCK_ID.test(value) || BRACKETED_BLOCK_ID.test(value);
}

function trailingIdHost(inner: Node[]):
  | {
      inner: Node[];
      chain: { node: Node; parent: Node[]; index: number }[];
    }
  | undefined {
  const chain: { node: Node; parent: Node[]; index: number }[] = [];
  let kids = inner;
  for (let depth = 0; depth < 4; depth++) {
    const last = kids[kids.length - 1];
    if (!last) return undefined;
    if (last.type === "text") {
      const value = (last as ValueNode).value;
      const before = kids[kids.length - 2];
      // Step over any tail into the wrapper behind it, but only when this text
      // could not be the identifier's own host. The tail used to have to be free of
      // word characters, which was as far as the evidence went at the time -- probes
      // since recorded show `*^blk* word` and `*^blk*, word` both registering `blk`
      // and rendering only the tail, so what follows the wrapper is unrestricted.
      //
      // Widening is safe because the real gate is downstream: whatever this descends
      // into must still *end* with an identifier for `TRAILING_BLOCK_ID` to match, so
      // `*em* word` descends, finds `em`, and changes nothing.
      // `BRACKETED_BLOCK_ID` too, or this descends past its own host: `*x* \[^1`
      // leaves the identifier in a text node whose value is ` [^1`, which the
      // whitespace-anchored pattern cannot match, so the walk stepped into the
      // emphasis behind it and found nothing to strip.
      if (
        TRAILING_BLOCK_ID.test(value) ||
        BRACKETED_BLOCK_ID.test(value) ||
        !before ||
        !ID_WRAPPERS.has(before.type)
      ) {
        return { inner: kids, chain };
      }
      const behind = (before as ParentNode).children;
      if (!Array.isArray(behind)) return { inner: kids, chain };
      chain.unshift({ node: before, parent: kids, index: kids.length - 2 });
      kids = behind;
      continue;
    }
    if (!ID_WRAPPERS.has(last.type)) return undefined;
    const next = (last as ParentNode).children;
    if (!Array.isArray(next)) return undefined;
    chain.unshift({ node: last, parent: kids, index: kids.length - 1 });
    kids = next;
  }
  return undefined;
}

function stripBlockIds(tree: Root, source: string): Root {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: Node[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = parent.children.length - 1; index >= 0; index--) {
      const child = parent.children[index]!;
      // A heading carries one as readily as a paragraph: `## Heading ^id`, and so
      // does a callout title: `> [!note] ^blk` registers `blk` and renders a title
      // with nothing in it. The emptied `calloutTitle` has to stay, because its
      // presence is what suppresses the capitalised type a title-less callout shows
      // -- strip the node and the title reads `Note` instead of nothing.
      if (
        child.type !== "paragraph" &&
        child.type !== "heading" &&
        child.type !== "calloutTitle"
      ) {
        continue;
      }
      const inner = (child as ParentNode).children;
      // Through a trailing inline wrapper, because the identifier is recognised
      // from the raw line and emphasis around it is invisible to that scan:
      // `*^blk*` renders nothing, `x *^blk*` renders `x`, and `*x ^blk*` renders
      // `x` with the emphasis kept. A code span or a math span *does* shield one --
      // `` `^blk` `` and `$^blk$` keep their text -- so those are not descended.
      // An identifier may sit at the end of the paragraph's FIRST line rather than
      // its last: `*^blk*` over `next` is one paragraph whose rendered text is just
      // `next`, with the emphasis still reported as an empty `em:`. The host walk
      // only ever looks at the final segment, so the segment before the first
      // `break` is offered to it too -- and only when the final one found nothing,
      // so a paragraph with identifiers on both lines keeps the recorded last-wins
      // behaviour.
      // Wrapped only, which `^blk` over `para` is what forces: that one keeps its
      // identifier as text (`^blk para`), while `*^blk*` over `next` strips it. Same
      // asymmetry the paragraph-removal branch below already records -- an unwrapped
      // identifier on its own line has nothing to attach to, and a wrapped one does.
      const firstBreak = inner.findIndex((node) => node.type === "break");
      const tailHost = trailingIdHost(inner);
      let host = tailHost;
      if (!tailHost || !hostHasIdentifier(tailHost)) {
        const headHost =
          firstBreak > 0
            ? trailingIdHost(inner.slice(0, firstBreak))
            : undefined;
        if (headHost && headHost.chain.length > 0) host = headHost;
      }
      if (!host) continue;
      const last = host.inner[host.inner.length - 1];
      if (!last || last.type !== "text") continue;
      const value = (last as ValueNode).value;

      // A paragraph that is only an identifier is usually not a block at all --
      // `^blk` alone reports no section and no identifier, so there was nothing for
      // it to attach to. But that only holds when nothing follows it on the next
      // line. Measured across four forms:
      //
      //     ^blk              no section      nothing to attach to
      //     ^blk ⏎⏎ para      no section      blank line, same case
      //     ^blk ⏎ - item     *a* paragraph   the next block is adjacent
      //      ^blk             *a* paragraph   indented, so not an identifier line
      //
      // Dropping all four cost the paragraph in the latter two.
      if (
        child.type === "paragraph" &&
        inner.length === 1 &&
        // Only an *unwrapped* identifier takes the paragraph with it. `*^blk*`
        // keeps its paragraph and its emphasis, reported as an `em:` with no
        // content, so dropping the block here cost six cases on `sections`.
        host.chain.length === 0 &&
        ONLY_BLOCK_ID.test(value) &&
        (child as { position?: { start?: { column?: number } } }).position
          ?.start?.column === 1 &&
        !adjacentBlockFollows(parent.children, index, source)
      ) {
        parent.children.splice(index, 1);
        continue;
      }
      // Not when a space follows the identifier. `text ^blk ` keeps its `^blk` to
      // Obsidian and records no identifier at all, so stripping it dropped text the
      // source still holds.
      // Only for an unwrapped identifier. `text ^blk ` keeps its `^blk` because the
      // space sits straight after the identifier, but in `*^blk* ` the `*` does, and
      // Obsidian strips that one -- so the closing marker is what the scan sees, not
      // the whitespace beyond it.
      const end = pointOf(child, "end");
      if (
        host.chain.length === 0 &&
        end !== undefined &&
        /[ \t]/u.test(source[end - 1] ?? "")
      ) {
        continue;
      }
      const match = TRAILING_BLOCK_ID.exec(value);
      if (!match) {
        // An escaped bracket leaves a literal `[` with the caret free behind it, so
        // `\[^1` renders `[` alone. The value cannot tell that apart from an
        // unescaped `[^1`, which renders in full -- both resolve to the text `[^1` --
        // so the source decides, which is why the spans differ by the backslash.
        const bracketed = BRACKETED_BLOCK_ID.exec(value);
        const start = pointOf(child, "start");
        const stop = pointOf(child, "end");
        if (!bracketed || start === undefined || stop === undefined) continue;
        if (!source.slice(start, stop).endsWith(`\\${bracketed[0]}`)) continue;
        // A `]` run behind the identifier needs an opener still outstanding.
        const closers = bracketed[0].length - 1 - (bracketed[1]?.length ?? 0);
        const idAt = stop - closers - (bracketed[1]?.length ?? 0);
        const blockFrom = pointOf(child, "start") ?? start;
        if (closers > 0 && !bracketStillOpen(source, blockFrom, idAt)) continue;
        // Drop the identifier and keep everything either side of it, brackets
        // included: `[\[^1` renders `[[` and `[\[^1]]]` renders `[[]]]`.
        const kept = bracketed.index + 1;
        (last as ValueNode).value =
          value.slice(0, kept) +
          value.slice(kept + (bracketed[1]?.length ?? 0));
        continue;
      }
      (last as ValueNode).value = value.slice(0, match.index);
      // The emptied wrapper stays. Obsidian still reports an emphasis for
      // `*^blk*` -- an `em:` with no content -- and still reports the paragraph
      // section, so pruning it cost nine cases on `sections` and `emphasis` while
      // the text was already right.
    }
  });

  return tree;
}

export function projectOurs(
  markdown: string,
  profile: ProfileName,
): Projections {
  const source = applyTextTransform(markdown);
  const tree = stripBlockIds(
    alignTableCells(parseOurs(markdown, profile)),
    source,
  );
  return {
    ...projectMdast(tree, source),
    text: mdastText(tree, definedFootnotes(tree), source),
    sections: mdastSections(tree, source),
  };
}

/**
 * Our side of the positioned oracle, in `computeMetadataAsync`'s own shape.
 *
 * Separate from `metaOurs` because the two answer different questions. That one
 * mirrors `getFileCache`, which names identifiers; this one mirrors the parser
 * called on a string, which also says where each sits -- so it is the only
 * projection that can catch a node placed on the wrong line.
 *
 * Every rule here was measured against recorded answers, and the inline
 * footnote is the subtle one. `^[body]` is reported as a *definition* named
 * `[inline<n>` spanning the body alone, never the `^[` or the `]`; `^[]` is
 * reported as a *reference* with an empty name at the caret. The index counts
 * both kinds in document order and does not restart in a new block, which is
 * why `^[] and ^[x]` names its definition `[inline1`.
 */
/**
 * Whether a frontmatter body is YAML Obsidian would actually accept.
 *
 * Obsidian reports no `frontmatterPosition` at all unless the block parses as a
 * non-empty mapping, and the corpus exercises four separate ways to fail that:
 *
 *     '---' / '---'                                   empty
 *     '---' / 'Title' / '---'                         a bare scalar, not a mapping
 *     '---' / 'title: "unterminated' / '---'          unterminated quote
 *     '---' / 'k: 2.' / 'k: 3.' / '---'               duplicate keys
 *
 * The node stays in the tree either way, which is the governing rule: the source really
 * does hold a `---` block, and whether the YAML parses is the consumer's concern --
 * Quartz's own FrontMatter plugin owns it, and `remark-frontmatter` is not even in the
 * pinned chain. So the drop belongs here in the projection rather than in the parse.
 *
 * `js-yaml` throws on both of the last two, which is why this is a parse rather than a
 * pattern: duplicate keys cannot be detected by inspection.
 */
function parsesAsMapping(body: string): boolean {
  let parsed: unknown;
  try {
    parsed = load(body);
  } catch {
    return false;
  }
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    Object.keys(parsed).length > 0
  );
}

export function computeOurs(tree: Root, source: string): ComputedMeta {
  const defined = definedFootnotes(tree);
  const lineStarts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === "\n") lineStarts.push(index + 1);
  }
  /** `line:col`, both counting from zero as the cache reports them. */
  const atOffset = (offset: number): string => {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1]! <= offset) {
      line++;
    }
    return `${line}:${offset - lineStarts[line]!}`;
  };
  const atPoint = (point: { line: number; column: number }): string =>
    `${point.line - 1}:${point.column - 1}`;

  const footnotes: string[] = [];
  const footnoteRefs: string[] = [];
  const headings: string[] = [];
  /**
   * The number of footnote markers seen so far, which is what names an inline
   * footnote's synthetic definition.
   *
   * Shared between references and inline footnotes rather than counted per
   * kind, and advanced only by a reference something *defines*. Four probes
   * pin each half: `a[^1] and ^[x]` with `[^1]` defined names the inline
   * `[inline1`, while `a[^nodef] and ^[x]` names it `[inline0`; and
   * `^[a] b[^1] ^[c]` names them `[inline0` and `[inline2`, the reference
   * between taking 1. So the counter numbers the markers Obsidian will
   * render -- exactly the set `footnoteRefs` records, plus the inline ones.
   */
  let markerIndex = 0;

  visit(tree, (node: Node, _index, parent) => {
    if (node.type === "footnote") {
      const start = node.position?.start?.offset;
      const end = node.position?.end?.offset;
      if (start === undefined || end === undefined) return SKIP;
      // The body, which is what the reported span covers.
      const from = start + 2;
      const to = end - 1;
      const name = `[inline${markerIndex}`;
      markerIndex++;
      if (source.slice(from, to) === "") {
        footnoteRefs.push(`@${atOffset(start)}`);
      } else {
        footnotes.push(`${name}@${atOffset(from)}-${atOffset(to)}`);
      }
      // A nested `^[...]` is part of the outer body, not a second footnote:
      // `^[^[note]]]` is reported once, as `[inline0` spanning `^[note]`.
      return SKIP;
    }

    if (node.type === "footnoteDefinition" && node.position) {
      const id = String((node as unknown as { identifier: string }).identifier);
      footnotes.push(
        `${id}@${atPoint(node.position.start)}-${atPoint(node.position.end)}`,
      );
      return;
    }

    if (node.type === "footnoteReference" && node.position) {
      const id = String((node as unknown as { identifier: string }).identifier);
      // The cache records only a reference something defines -- and only such a
      // reference is a marker, so only it advances the counter.
      if (defined.has(id)) {
        footnoteRefs.push(`${id}@${atPoint(node.position.start)}`);
        markerIndex++;
      }
      return;
    }

    // A reference written inside a `%%` comment is indexed even though nothing
    // renders it, and our tree keeps the comment as one opaque value rather
    // than nodes -- so the references have to be read out as text.
    //
    // Read from the comment's *source slice*, not its value: inside a
    // container the value has each line's `> ` stripped, so a value index no
    // longer tells you where the match sits and the reference lands at the
    // wrong column. A match in the slice is at a real offset by construction.
    // Guarded on the type alone, so a comment without offsets still stops the
    // walk. Requiring them meant one could fall through and have its children
    // counted -- a definition inside a `%%` comment reported as defining, which
    // is the opposite of the rule.
    if (node.type === "comment") {
      const from = node.position?.start?.offset;
      const to = node.position?.end?.offset;
      if (from === undefined || to === undefined) return SKIP;
      const slice = source.slice(from, to);
      for (const match of slice.matchAll(/\[\^([^[\]\s]+)\]/gu)) {
        const id = match[1]!.toLowerCase();
        if (defined.has(id)) {
          footnoteRefs.push(`${id}@${atOffset(from + match.index)}`);
        }
      }
      return SKIP;
    }

    // Only the document's own headings, as `metaOurs` explains.
    if (
      isType<HeadingNode>(node, "heading") &&
      parent === tree &&
      node.position
    ) {
      headings.push(
        `${node.depth}:${headingName(node, source)}@${atPoint(node.position.start)}`,
      );
    }
    return;
  });

  // Obsidian reports only top-level blocks as sections -- a list inside a
  // quote is part of the quote's section, not one of its own -- so the
  // document's own children are the whole projection.
  // Obsidian reports a top-level block's section from the start of its *line*, so a
  // block indented one to three spaces begins at column 0 while mdast quite correctly
  // begins it at the content. Measured across 87 cases whose only disagreement is
  // exactly that, among them ` [^1]: def`, ` ^blk` and `  $$y^2$$`.
  //
  // Four spaces is not this family and must not be folded into it: that is indented
  // code, a different construct, which is why `    [^12]:` reports column 2 rather
  // than 0. Keying on "the prefix is only whitespace" rather than on a width keeps
  // them apart, since the four-space case is not a top-level paragraph at all.
  //
  // The clamp lives here, in the harness's mirror of Obsidian's reporting, and not in
  // the tree: a paragraph's position has to keep pointing at its content, or a
  // formatter editing around it would consume the author's indentation.
  const lineStartOf = (line: number): number | undefined =>
    lineStarts[line - 1];
  const sectionStart = (start: {
    line: number;
    column: number;
    offset?: number;
  }): string => {
    const lineStart = lineStartOf(start.line);
    if (
      start.offset !== undefined &&
      lineStart !== undefined &&
      source.slice(lineStart, start.offset).trim() === ""
    ) {
      return `${start.line - 1}:0`;
    }
    return atPoint(start);
  };

  const sections = tree.children
    .filter((child) => child.position)
    .map(
      (child) =>
        `${child.type}@${sectionStart(child.position!.start)}-${atPoint(child.position!.end)}`,
    );

  const spanOf = (node: Node): string =>
    `${atPoint(node.position!.start)}-${atPoint(node.position!.end)}`;

  const links: string[] = [];
  const embeds: string[] = [];
  const tags: string[] = [];
  visit(tree, (node: Node) => {
    if (node.type === "comment") return SKIP;
    if (!node.position) return;
    if (isType<ValueNode>(node, "tag")) {
      tags.push(`#${node.value}@${spanOf(node)}`);
      return;
    }
    // An ordinary markdown link is in `metadataCache.links` too, and this projection
    // only ever collected wikilinks -- so every one of them read as a link we failed to
    // index. 94 of the 116 divergences on this key were that, with not one case of us
    // inventing a link, which is the shape of a missing collector rather than a parse
    // bug. `[a](u)` is indexed `[a](u)=>u|a`.
    //
    // `url` is taken from the node rather than the source because mdast has already
    // resolved what the cache reports resolved: `<u>` loses its brackets, `<u v>` keeps
    // its space, and `u\(v\)` becomes `u(v)`.
    // The same gap one surface along: `embeds` only ever received an embedded
    // *wikilink*, so a markdown image was never indexed either. `![a](u)` is an embed to
    // Obsidian exactly as `![[a]]` is.
    if (isType<ImageNode>(node, "image")) {
      const url = node.url ?? "";
      if (!isVaultTarget(url)) return;
      const original = source.slice(
        node.position.start.offset!,
        node.position.end.offset!,
      );
      const alt = String((node as unknown as { alt?: string }).alt ?? "");
      embeds.push(`${original}=>${url}|${alt}@${spanOf(node)}`);
      return;
    }
    if (isType<LinkNode>(node, "link")) {
      const url = node.url ?? "";
      if (!isVaultTarget(url)) return;
      const original = source.slice(
        node.position.start.offset!,
        node.position.end.offset!,
      );
      links.push(
        `${original}=>${url}|${mdastText(node).trim()}@${spanOf(node)}`,
      );
      return;
    }
    if (!isType<WikilinkNode>(node, "wikilink")) return;
    const target =
      node.heading === "" ? node.path : `${node.path}#${node.heading}`;
    // `original` is the source as written, which is what the cache reports and
    // what no field of the node reproduces on its own.
    const original = source.slice(
      node.position.start.offset!,
      node.position.end.offset!,
    );
    // The cache joins a path and a fragment with ` > `, as `mdastText` does
    // for the rendered text: `[[page#heading]]` displays `page > heading`, not
    // the fragment alone. An alias replaces the whole thing.
    const shown =
      node.alias || [node.path, node.heading].filter(Boolean).join(" > ");
    (node.embedded ? embeds : links).push(
      `${original}=>${target}|${shown}@${spanOf(node)}`,
    );
  });

  /**
   * A block identifier names the block it trails, and twelve probes fix every
   * part of the rule.
   *
   * It is read from the block's own *lines*, not from the node's span: ` ^blk`
   * registers while `^blk` does not, and the only difference is a leading space
   * the paragraph's position excludes. That also makes the reported span start
   * at the line, as Obsidian reports it.
   *
   * The identifier must trail at least one character, hold only alphanumerics
   * and hyphens (`^a_b` registers nothing at all), and end its line exactly
   * (`^blk ` registers nothing). Where a line holds two, the last wins. A
   * setext underline is dropped first, since `^blk` over `---` registers from
   * the content line above it.
   */
  const blocks: string[] = [];
  for (const child of tree.children) {
    const from = child.position?.start?.offset;
    const to = child.position?.end?.offset;
    if (from === undefined || to === undefined) continue;
    const lineStart = source.lastIndexOf("\n", from - 1) + 1;
    const lineEnd = source.indexOf("\n", to);
    const full = source.slice(
      lineStart,
      lineEnd === -1 ? source.length : lineEnd,
    );
    const raw = full.replace(/\r?\n[ \t]*(?:>[ \t]*)*[=-]+[ \t]*$/u, "");
    // Trailing inline markers are allowed between the identifier and the end of
    // the line: `*^blk*` registers the block `blk`, as do `==^blk==` and
    // `~~^blk~~`. The identifier is read from the raw line, so emphasis around it
    // is invisible to the scan -- which `stripBlockIds` now mirrors.
    //
    // Whitespace may follow those markers but never the identifier itself. That is
    // the whole difference between `*^blk* `, which registers, and `text ^blk `,
    // which registers nothing.
    // Scanned rather than anchored at the end of the line. What must sit straight
    // after the identifier is a closing marker; what sits after *that* is
    // unrestricted, because `*^blk* word` and `*^blk*, word` both register `blk` and
    // render only their tail. Anchoring the whole tail at `$` could not express that
    // -- it had to be free of letters, so a following word defeated it.
    //
    // The last candidate wins, which is the recorded rule for a line holding two.
    let id: { name: string; index: number } | undefined;
    for (const candidate of raw.matchAll(/\^([A-Za-z0-9-]+)/gu)) {
      const at = candidate.index ?? 0;
      const after = raw.slice(at + candidate[0].length);
      if (after !== "") {
        // A `]` run is let through to the escaped-bracket gate below, which is written
        // for exactly this shape -- `closersAfter` and `bracketStillOpen` validate it --
        // and was unreachable because this scan rejected the candidate first. It also
        // skips the opener test underneath: a `]` is closing a bracket, not a wrapper, so
        // there is no `]` earlier on the line to find. `[[\[^1]` and `[\[^1]]]` both
        // register `1` in Obsidian.
        const closerRun = after.startsWith("]");
        if (!closerRun && !/^[*_=~]/u.test(after)) continue;
        // A marker can only *close* something that opened, so the same marker has to
        // appear before the caret somewhere on the line. `x ^a_b` has `_b` after the
        // identifier and no `_` before it, so that one is part of a word rather than
        // a closing run, and Obsidian registers no block. Without the test at all,
        // widening the tail to allow a following word read `^a` as an identifier and
        // cost two cases that had always been right.
        //
        // Anywhere before, not immediately before: `*x ^blk*` registers `blk` with
        // its opener three characters back, so requiring adjacency cost that case
        // instead. The wrapper opens where it opens.
        if (!closerRun && !raw.slice(0, at).includes(after[0] ?? "")) continue;
      }
      id = { name: candidate[1] ?? "", index: at };
    }
    if (!id) continue;
    // The caret must follow whitespace. Without that `$x^2` reports the block
    // `2`, `[^1` reports `1` and `[[a#^blk` reports `blk` -- six false
    // identifiers in the corpus, all of them a caret inside another construct.
    // A setext heading is the measured exception: `^blk` over `---` registers
    // from column zero, where the same line alone registers nothing.
    // ...and before it, for the same reason. The caret must still not sit inside
    // another construct, which is what this guard is for: `$x^2`, `[^1` and
    // `[[a#^blk` would otherwise report six false identifiers.
    const opener = /[*_=~]+$/u.exec(raw.slice(0, id.index));
    const beforeAt = id.index - (opener?.[0].length ?? 0);
    const before = raw[beforeAt - 1];
    const setext = raw !== full;
    // A wrapper counts as something preceding the caret, which is what separates
    // `*^blk*` from a bare `^blk`. Only a line that is *exactly* an identifier
    // registers nothing -- a leading space is enough to make ` ^blk` register, so
    // the exclusion is narrow and the wrapper falls outside it.
    const wrapped = opener !== null;
    // An *escaped* bracket counts as something preceding the caret, where a bare one
    // does not. The exclusion above exists because `[^1` opens a footnote reference
    // and the reference claims the caret -- but `\[^1` leaves a literal `[`, so the
    // caret is free and the trailing `^1` is an ordinary block identifier. Measured
    // on both halves: nine recorded cases register with the escape, and the four
    // without it -- `token/footnote-ref/no-closer` and its siblings -- register
    // nothing and already matched.
    const closersAfter = /^\]*$/u.test(raw.slice(id.index + 1 + id.name.length))
      ? raw.slice(id.index + 1 + id.name.length).length
      : 0;
    const escapedBracket =
      before === "[" &&
      raw[beforeAt - 2] === "\\" &&
      (closersAfter === 0 ||
        bracketStillOpen(source, from, lineStart + id.index - 2));
    if (
      !(setext && beforeAt === 0) &&
      !wrapped &&
      !escapedBracket &&
      !(before && /\s/u.test(before))
    ) {
      continue;
    }
    blocks.push(
      `${id.name}@${atOffset(lineStart)}-${atPoint(child.position!.end)}`,
    );
  }

  /**
   * List items, as `listItems` reports them.
   *
   * `parent` is a real line number for a nested item -- its parent's -- and
   * the negative of the line its list begins on for a root item, with a list
   * on line 0 reported as -1 rather than -0. Seven probes agree, including one
   * list starting on line 2 reported as -2.
   *
   * `task` is the character between the brackets rather than a boolean, so a
   * custom marker survives; an item that is not a task has none.
   */
  const listItems: string[] = [];
  // An item's span covers its own content only: `- a` over `  - b` ends at the
  // `a`, not after the nested list, so the end comes from the last child that
  // is not itself a list.
  const itemEnd = (item: Node) => {
    const children = (item as unknown as { children: Node[] }).children;
    for (let index = children.length - 1; index >= 0; index--) {
      const child = children[index]!;
      if (child.type !== "list" && child.position) return child.position.end;
    }
    return item.position!.end;
  };
  const walkList = (list: Node, parent: number): void => {
    for (const item of (list as unknown as { children: Node[] }).children) {
      if (item.type !== "listItem" || !item.position) continue;
      const marker = /^[-*+]\s*\[(.)\]/u.exec(
        source.slice(item.position.start.offset!),
      );
      listItems.push(
        `${marker ? JSON.stringify(marker[1]) : "-"}|parent:${parent}@${atPoint(item.position.start)}-${atPoint(itemEnd(item))}`,
      );
      const own = item.position.start.line - 1;
      for (const nested of (item as unknown as { children: Node[] }).children) {
        if (nested.type === "list") walkList(nested, own);
      }
    }
  };
  // A `%%` comment hides its body, so nothing inside one is indexed. The `links`,
  // `tags` and `blocks` collectors above already `return SKIP` on a `comment`; this walk
  // is a separate pass and counted them -- `%%` / `- [ ] Hidden` reported two items where
  // Obsidian reports none. Collected as a set because `visit` reaches a list directly
  // rather than descending to it, so there is no ancestor chain to test here.
  const inComment = new Set<Node>();
  visit(tree, "comment", (node: Node) => {
    visit(node, (inner: Node) => {
      inComment.add(inner);
    });
  });

  // Any list that is not itself inside an item, so a list in a blockquote is
  // reached too -- looking only at the document's own children reported nothing
  // at all for `> - a`.
  visit(tree, "list", (node: Node, _index, parent) => {
    if ((parent as Node | null)?.type === "listItem") return;
    if (inComment.has(node)) return;
    if (!node.position) return;
    const line = node.position.start.line - 1;
    walkList(node, line === 0 ? -1 : -line);
  });

  const yaml = tree.children.find((child) => child.type === "yaml");
  const frontmatterPosition =
    yaml?.position &&
    yaml.position.start.offset !== undefined &&
    parsesAsMapping(String((yaml as unknown as { value: unknown }).value))
      ? spanOf(yaml)
      : undefined;

  return {
    footnotes,
    footnoteRefs,
    headings,
    sections,
    links,
    embeds,
    tags,
    blocks,
    listItems,
    ...(frontmatterPosition === undefined ? {} : { frontmatterPosition }),
  };
}
