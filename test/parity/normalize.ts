/**
 * Our side of the comparison.
 *
 * Obsidian-specific constructs are projected from **mdast**, not HTML, because
 * producing correct mdast nodes is what remark-obsidian is responsible for.
 * Turning a `wikilink` node into an anchor is `obsidian-flavored-markdown`'s job,
 * so asserting on rendered anchors here would test the wrong package — and would
 * fail for a reason that is not a parity bug.
 */

import type { Root } from "mdast";
import type { Node } from "unist";
import { SKIP, visit } from "unist-util-visit";
import { applyTextTransform, parseOurs, type ProfileName } from "./chain.js";
import type {
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
function textOf(node: Node, defined?: ReadonlySet<string>): string {
  let out = "";
  visit(node, (child: Node) => {
    if (child.type === "text") out += (child as ValueNode).value;
    else if (child.type === "break") out += "\n";
    // Same rule as `mdastText`: a reference nothing defines is shown by
    // Obsidian as its bare label, and the DOM side reads that text too.
    else if (child.type === "footnoteReference") {
      const id = String(
        (child as unknown as { identifier: string }).identifier,
      );
      if (defined && !defined.has(id)) out += id;
    }
  });
  return out;
}

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
  visit(tree, "footnoteDefinition", (node: Node) => {
    defined.add(String((node as unknown as { identifier: string }).identifier));
  });
  return defined;
}

/** From mdast, not HTML: `wikilink`/`tag` have no hast handler and vanish when rendered. */
export function mdastText(tree: Node, defined?: ReadonlySet<string>): string {
  const parts: string[] = [];

  const walk = (node: Node): void => {
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
        parts.push(`${raw.replace(/<[^>]*>/g, " ")} `);
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
        for (const child of children) walk(child);
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
      default:
        break;
    }

    const children = (node as { children?: Node[] }).children;
    if (children) for (const child of children) walk(child);
    if (BLOCK_TYPES.has(node.type)) parts.push(" ");
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
function headingName(node: Node, source: string): string {
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
  const body = raw
    .replace(/\r?\n[ \t]*(?:>[ \t]*)*[=-]+[ \t]*$/, "")
    .replace(/(?:^|[ \t])\^[A-Za-z0-9-]+[ \t]*$/u, "");
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
  options: { readonly skipUnreferencedDefinitions?: boolean } = {},
): Omit<Projections, "text" | "sections"> {
  const skipUnreferenced = options.skipUnreferencedDefinitions ?? true;
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
      highlights.push(textOf(node, defined));
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
  });
  const defined = definedFootnotes(tree);
  const target = (link: LinkItem): string =>
    link.heading === "" ? link.path : `${link.path}#${link.heading}`;

  // Only a resolved `[^x]`. An inline `^[...]` is not a reference to the
  // cache at all, and neither is a `[^x]` nothing defines.
  const footnotes: string[] = [];
  visit(tree, (node: Node) => {
    if (node.type === "footnoteReference") {
      const id = String((node as unknown as { identifier: string }).identifier);
      if (defined.has(id)) footnotes.push(id);
      return;
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
  });

  return {
    headings: projected.headings,
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
