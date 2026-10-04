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
import { visit } from "unist-util-visit";
import { applyTextTransform, parseOurs, type ProfileName } from "./chain.js";
import type {
  LinkItem,
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
function textOf(node: Node): string {
  let out = "";
  visit(node, (child: Node) => {
    if (child.type === "text") out += (child as ValueNode).value;
    else if (child.type === "break") out += "\n";
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

/** From mdast, not HTML: `wikilink`/`tag` have no hast handler and vanish when rendered. */
export function mdastText(tree: Node): string {
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
          link.value ||
            (link.embedded
              ? link.path
              : link.alias ||
                [link.path, link.heading].filter(Boolean).join(" > ")),
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
      case "html":
        // Obsidian's textContent has no markup, so compare inner text only. The
        // trailing space is the block separator every other block type gets from
        // BLOCK_TYPES below, which this early return would otherwise skip.
        parts.push(`${(node as ValueNode).value.replace(/<[^>]*>/g, " ")} `);
        return;
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
          const type = callout.calloutType;
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
      case "footnoteReference":
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
  const body = raw.replace(/\r?\n[ \t]*(?:>[ \t]*)*[=-]+[ \t]*$/, "");
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
): Omit<Projections, "text" | "sections"> {
  const math: MathItem[] = [];
  const links: LinkItem[] = [];
  const tags: string[] = [];
  const headings: string[] = [];
  const tasks: TaskItem[] = [];
  const highlights: string[] = [];
  const emphasis: string[] = [];

  visit(tree, (node: Node) => {
    // `mdastText`, not `textOf`, so a wikilink or math span inside the emphasis
    // yields the same display text the DOM side reads off the rendered element.
    if (node.type === "strong" || node.type === "emphasis") {
      const kind = node.type === "strong" ? "strong" : "em";
      emphasis.push(`${kind}:${mdastText(node)}`);
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
    if (node.type === "tag") {
      tags.push((node as ValueNode).value);
      return;
    }
    if (node.type === "highlight") {
      highlights.push(textOf(node));
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
    const columns = (rows[0] as ParentNode | undefined)?.children.length;
    if (columns === undefined) return;
    for (const row of rows) {
      const cells = (row as ParentNode).children;
      if (cells.length > columns) cells.length = columns;
    }
  });
  return tree;
}

export function projectOurs(
  markdown: string,
  profile: ProfileName,
): Projections {
  const source = applyTextTransform(markdown);
  const tree = alignTableCells(parseOurs(markdown, profile));
  return {
    ...projectMdast(tree, source),
    text: mdastText(tree),
    sections: mdastSections(tree, source),
  };
}
