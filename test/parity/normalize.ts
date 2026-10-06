/**
 * Our side of the comparison.
 *
 * Obsidian-specific constructs are projected from **mdast**, not HTML, because
 * producing correct mdast nodes is what remark-obsidian is responsible for.
 * Turning a `wikilink` node into an anchor is `obsidian-flavored-markdown`'s job,
 * so asserting on rendered anchors here would test the wrong package — and would
 * fail for a reason that is not a parity bug.
 */

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
          ? [link.path, link.heading].filter(Boolean).join("#")
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

/** From mdast, not HTML: `wikilink`/`tag` have no hast handler and vanish when rendered. */
export function mdastText(tree: Node, defined?: ReadonlySet<string>): string {
  const parts: string[] = [];

  const walk = (node: Node, phrasing = false): void => {
    switch (node.type) {
      case "text":
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
              [link.path, link.heading].filter(Boolean).join("#")
            : link.value ||
                link.alias ||
                [link.path, link.heading].filter(Boolean).join(" > "),
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
        parts.push("\u27e8math\u27e9");
        return;
      case "math":
        parts.push("\u27e8math\u27e9 ");
        return;
      case "code":
        parts.push(`${(node as ValueNode).value} `);
        return;
      case "html": {
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
        // than separated: `a<br>b` reads `ab`, and `~~<br>~~` reads `~~~~`.
        // Replacing one with a space invented a word boundary the DOM has no
        // equivalent for.
        parts.push(
          `${decodeEntities(raw.replace(/<[^>]*>/g, ""))}${phrasing ? "" : " "}`,
        );
        return;
      }
      case "break":
        parts.push("\n");
        return;
      // Obsidian resolves a relative image path against the vault and renders it
      // as an internal embed, which the recorder reduces to its `src`. An
      // absolute URL stays an ordinary external image.
      case "image": {
        const url = (node as { url?: string }).url ?? "";
        if (url !== "" && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url)) {
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
          walk(child, phrasing);
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
        for (const child of children) walk(child, phrasing);
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
        if (
          only &&
          only.type === "text" &&
          (only as ValueNode).value === url &&
          url.startsWith("mailto:")
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
    if (children) for (const child of children) walk(child, inner);
    if (!phrasing && BLOCK_TYPES.has(node.type)) parts.push(" ");
  };

  walk(tree);
  return parts.join("").replace(/\s+/g, " ").trim();
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
  const atx = /^#{1,6}[ \t]+/.exec(raw);
  if (atx)
    return raw
      .slice(atx[0].length)
      .replace(/[ \t]*#*[ \t]*$/, "")
      .trim();
  // Setext: the underline is inside the node's span but outside its name. Inside a
  // container the slice keeps the block prefix, so `para\n> ===` must lose the
  // whole final line, marker included.
  const underlined = raw.replace(/\r?\n[ \t]*(?:>[ \t]*)*[=-]+[ \t]*$/, "");
  // A trailing block identifier is not part of the name, but it only counts as
  // one when it trails something: `para ^blk` is named `para`, while a heading
  // whose whole content is `^blk` keeps it. Measured against
  // `computeMetadataAsync`, which reports `^blk\n---` as the heading `^blk` --
  // stripping unconditionally named it the empty string.
  const stripped = underlined.replace(/(?:^|[ \t])\^[A-Za-z0-9-]+[ \t]*$/u, "");
  const body = stripped.trim() === "" ? underlined : stripped;
  // A setext heading shares its content chunk with any link reference
  // definitions above it, so its span starts back at them: `[ref]: /url\npara\n===`
  // reports a heading named `para`, not `[ref]: /url\npara`.
  const lines = body.split("\n");
  while (lines.length > 1 && /^ {0,3}\[[^\]]*\]:/.test(lines[0] ?? "")) {
    lines.shift();
  }
  return lines.join("\n").trim();
}

export function projectMdast(
  tree: Root,
  source: string,
  options: {
    readonly skipUnreferencedDefinitions?: boolean;
    readonly skipComments?: boolean;
  } = {},
): Omit<Projections, "text" | "sections"> {
  const skipUnreferenced = options.skipUnreferencedDefinitions ?? true;
  const skipComments = options.skipComments ?? true;
  const math: MathItem[] = [];
  const defined = definedFootnotes(tree);
  const referenced = new Set<string>();
  visit(tree, "footnoteReference", (node: Node) => {
    referenced.add(
      String((node as unknown as { identifier: string }).identifier),
    );
  });

  const links: LinkItem[] = [];
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
      if (skipUnreferenced && !referenced.has(id)) return SKIP;
    }
    // `mdastText`, not `textOf`, so a wikilink or math span inside the emphasis
    // yields the same display text the DOM side reads off the rendered element.
    if (node.type === "strong" || node.type === "emphasis") {
      const kind = node.type === "strong" ? "strong" : "em";
      emphasis.push(`${kind}:${mdastText(node, defined)}`);
      return;
    }
    if (isType<WikilinkNode>(node, "wikilink")) {
      links.push({
        path: node.path,
        heading: node.heading,
        embedded: node.embedded,
      });
      return;
    }
    if (isType<ImageNode>(node, "image")) {
      const url = node.url ?? "";
      if (url !== "" && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url)) {
        links.push({ path: url, heading: "", embedded: true });
      }
      return;
    }
    // Same resolution as the image above, one step along: Obsidian resolves a
    // relative markdown destination against the vault and renders `[x](url)`
    // as an internal link, which the recorder captures like a wikilink. An
    // absolute URL stays an ordinary external link and is not a vault link.
    if (isType<ImageNode>(node, "link")) {
      const url = node.url ?? "";
      if (url !== "" && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url)) {
        links.push({ path: url, heading: "", embedded: false });
      }
      // Children still walk: a wikilink or tag can sit inside the label.
    }
    if (node.type === "tag") {
      tags.push((node as ValueNode).value);
      return;
    }
    if (node.type === "highlight") {
      highlights.push(stripColourMarker(textOf(node, defined)));
      return;
    }
    if (node.type === "inlineMath") {
      const display = Boolean(
        (node as { data?: { display?: boolean } }).data?.display,
      );
      math.push({ display, tex: (node as ValueNode).value });
      return;
    }
    if (node.type === "math") {
      math.push({ display: true, tex: (node as ValueNode).value });
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

  return { math, links, tags, headings, tasks, highlights, emphasis };
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
  });
  const defined = definedFootnotes(tree);
  const target = (link: LinkItem): string =>
    link.heading === "" ? link.path : `${link.path}#${link.heading}`;

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
function stripBlockIds(tree: Root): Root {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: Node[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = parent.children.length - 1; index >= 0; index--) {
      const child = parent.children[index]!;
      // A heading carries one as readily as a paragraph: `## Heading ^id`.
      if (child.type !== "paragraph" && child.type !== "heading") continue;
      const inner = (child as ParentNode).children;
      const last = inner[inner.length - 1];
      if (!last || last.type !== "text") continue;
      const value = (last as ValueNode).value;

      // A paragraph that is only an identifier is not a block at all. A
      // heading always is one, however little is left of it.
      if (
        child.type === "paragraph" &&
        inner.length === 1 &&
        ONLY_BLOCK_ID.test(value)
      ) {
        parent.children.splice(index, 1);
        continue;
      }
      const match = TRAILING_BLOCK_ID.exec(value);
      if (match) (last as ValueNode).value = value.slice(0, match.index);
    }
  });

  return tree;
}

export function projectOurs(
  markdown: string,
  profile: ProfileName,
): Projections {
  const source = applyTextTransform(markdown);
  const tree = stripBlockIds(alignTableCells(parseOurs(markdown, profile)));
  return {
    ...projectMdast(tree, source),
    text: mdastText(tree, definedFootnotes(tree)),
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
  const sections = tree.children
    .filter((child) => child.position)
    .map(
      (child) =>
        `${child.type}@${atPoint(child.position!.start)}-${atPoint(child.position!.end)}`,
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
    const id = /\^([A-Za-z0-9-]+)$/u.exec(raw);
    if (!id) continue;
    // The caret must follow whitespace. Without that `$x^2` reports the block
    // `2`, `[^1` reports `1` and `[[a#^blk` reports `blk` -- six false
    // identifiers in the corpus, all of them a caret inside another construct.
    // A setext heading is the measured exception: `^blk` over `---` registers
    // from column zero, where the same line alone registers nothing.
    const before = raw[id.index - 1];
    const setext = raw !== full;
    if (!(setext && id.index === 0) && !(before && /\s/u.test(before))) {
      continue;
    }
    blocks.push(
      `${id[1]}@${atOffset(lineStart)}-${atPoint(child.position!.end)}`,
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
  // Any list that is not itself inside an item, so a list in a blockquote is
  // reached too -- looking only at the document's own children reported nothing
  // at all for `> - a`.
  visit(tree, "list", (node: Node, _index, parent) => {
    if ((parent as Node | null)?.type === "listItem") return;
    if (!node.position) return;
    const line = node.position.start.line - 1;
    walkList(node, line === 0 ? -1 : -line);
  });

  const yaml = tree.children.find((child) => child.type === "yaml");
  const frontmatterPosition =
    yaml?.position && yaml.position.start.offset !== undefined
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
