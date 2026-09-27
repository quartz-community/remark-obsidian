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
  "paragraph",
  "heading",
  "listItem",
  "blockquote",
  "code",
  "math",
  "table",
  "tableRow",
  "thematicBreak",
  "html",
  "footnoteDefinition",
]);

/** From mdast, not HTML: `wikilink`/`tag` have no hast handler and vanish when rendered. */
export function mdastText(tree: Root): string {
  const parts: string[] = [];

  const walk = (node: Node): void => {
    switch (node.type) {
      case "text":
      case "inlineCode":
        parts.push((node as ValueNode).value);
        return;
      case "wikilink": {
        const link = node as WikilinkNode;
        // An embed shows its target; its alias slot holds dimensions, not display
        // text. A plain link shows its alias, or "page > heading" when un-aliased.
        parts.push(
          link.embedded
            ? link.path
            : link.alias ||
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
      case "html":
        // Obsidian's textContent has no markup, so compare inner text only.
        parts.push((node as ValueNode).value.replace(/<[^>]*>/g, " "));
        return;
      case "break":
        parts.push("\n");
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
export function mdastSections(tree: Root, source: string): SectionItem[] {
  const out: SectionItem[] = [];
  for (const child of tree.children) {
    const start = child.position?.start?.offset;
    const end = child.position?.end?.offset;
    if (start === undefined || end === undefined) continue;
    out.push({
      type: child.type,
      text: source.slice(start, end).replace(/\n+$/, ""),
    });
  }
  return out;
}

export function projectMdast(
  tree: Root,
): Omit<Projections, "text" | "sections"> {
  const math: MathItem[] = [];
  const links: LinkItem[] = [];
  const tags: string[] = [];
  const headings: string[] = [];
  const tasks: TaskItem[] = [];
  const highlights: string[] = [];

  visit(tree, (node: Node) => {
    if (isType<WikilinkNode>(node, "wikilink")) {
      links.push({
        path: node.path,
        heading: node.heading,
        embedded: node.embedded,
      });
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
      headings.push(`${node.depth}:${textOf(node).trim()}`);
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

  return { math, links, tags, headings, tasks, highlights };
}

export function projectOurs(
  markdown: string,
  profile: ProfileName,
): Projections {
  const source = applyTextTransform(markdown);
  const tree = parseOurs(markdown, profile);
  return {
    ...projectMdast(tree),
    text: mdastText(tree),
    sections: mdastSections(tree, source),
  };
}
