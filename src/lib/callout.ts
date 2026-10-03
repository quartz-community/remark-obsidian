import type { Blockquote, Paragraph, Root, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import type { Callout } from "./types.js";

/** `[!type]`, then an optional fold marker, then an optional title on the same line. */
const MARKER = /^\[!([^\]\s]+)\][ \t]*([-+]?)[ \t]*/;

interface ParentNode extends Node {
  children: Node[];
}

/**
 * Promote a blockquote whose first line opens with `[!type]` into a `callout`.
 *
 * A transform rather than a flow construct because the blockquote is already
 * parsed by the time the marker can be recognised, and because the marker lives in
 * the first paragraph's inline content. Obsidian accepts any `[!word]`, so no type
 * list is checked — `callout/unknown-type` confirms `[!custom]` is a callout.
 *
 * The title is stored exactly as written, empty when absent. Obsidian *displays*
 * the capitalised type in that case (`> [!warning]` reads "Warning"), but that is
 * the view defaulting a missing value, so it is left to whatever renders this.
 */
export function calloutTransform(tree: Root): void {
  visit(tree, "blockquote", (node: Node) => {
    const quote = node as Blockquote;
    const first = quote.children[0];
    if (!first || first.type !== "paragraph") return;

    const paragraph = first as Paragraph;
    const lead = paragraph.children[0];
    if (!lead || lead.type !== "text") return;

    const match = MARKER.exec((lead as Text).value);
    if (!match) return;

    const [consumed, calloutType, fold] = match;
    (lead as Text).value = (lead as Text).value.slice(consumed.length);

    // The title keeps its own nodes under a `calloutTitle` child rather than
    // being flattened to a string: `> [!note] **a**` renders a bold title, and
    // discarding the `strong` node would lose it from the tree entirely.
    const collect = (nodes: readonly Node[]): string =>
      nodes
        .map((c) =>
          "value" in c
            ? String((c as { value: unknown }).value)
            : collect(((c as ParentNode).children ?? []) as readonly Node[]),
        )
        .join("");

    // The marker's line can end two ways. `remark-breaks` usually turns the
    // newline into a `break` node, but inside a list item it stays inside the text
    // value, which is where a break-only rule swallowed the body as the title.
    const leadText = lead as Text;
    const newlineAt = leadText.value.indexOf("\n");
    let titleNodes: Node[];

    if (newlineAt !== -1) {
      titleNodes =
        leadText.value.slice(0, newlineAt).trim() === ""
          ? []
          : [
              {
                type: "text",
                value: leadText.value.slice(0, newlineAt),
              } as Text,
            ];
      leadText.value = leadText.value.slice(newlineAt + 1);
      if (leadText.value === "") paragraph.children.shift();
    } else {
      const breakAt = paragraph.children.findIndex((c) => c.type === "break");
      titleNodes =
        breakAt === -1
          ? paragraph.children.slice()
          : paragraph.children.slice(0, breakAt);
      paragraph.children =
        breakAt === -1 ? [] : paragraph.children.slice(breakAt + 1);
    }

    const title = collect(titleNodes).trim();

    // A title-only callout leaves an empty paragraph, which would project as a
    // block Obsidian does not report.
    if (
      paragraph.children.length === 0 ||
      (paragraph.children.length === 1 &&
        paragraph.children[0]!.type === "text" &&
        (paragraph.children[0] as Text).value.trim() === "")
    ) {
      quote.children.shift();
    }

    // Gate on the collected text, not on the node count: stripping the marker
    // can leave an empty text node behind, and a `calloutTitle` holding nothing
    // still reads as "this callout has a title", which suppresses the type name
    // Obsidian displays in its place.
    if (title !== "") {
      quote.children.unshift({
        type: "calloutTitle",
        children: titleNodes,
      } as unknown as (typeof quote.children)[number]);
    }

    const callout = node as unknown as Callout;
    callout.type = "callout";
    callout.calloutType = calloutType ?? "";
    callout.title = title;
    callout.collapsed = fold === "-" ? true : fold === "+" ? false : null;
  });
}
