import type { Blockquote, Paragraph, Root, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import type { Callout } from "./types.js";

/**
 * `[!type]`, an optional fold marker, then the end of the marker.
 *
 * Three details are measured rather than assumed, each against a recorded
 * case. The type may hold inner whitespace -- `> [! note]` is a callout and
 * reads "Note" -- but may not be empty, so `> [!]` is not one. The fold
 * marker must touch the bracket. And the marker must end the line or be
 * followed by a space or tab -- a titleless callout puts a newline there,
 * since the whole quote arrives as one text value: `> [!note]x` and `> [!note]-x` are both
 * ordinary quotes, which is why the title cannot simply start after `]`.
 */
const MARKER = /^\[!([^\]]+)\]([-+]?)(?=[ \t\n]|$)[ \t]?/;

/**
 * A marker binds to `>` plus at most one space. `>  [!note]` is a quote, not
 * a callout, and by the time the tree exists that second space is gone --
 * the blockquote tokenizer ate one and the paragraph begins at the other --
 * so this has to be read off the source line.
 */
const MARKER_COLUMN = /^(?:[^\S\n]*>)+ ?\[!/;

interface ParentNode extends Node {
  children: Node[];
}

interface Point {
  line: number;
  column: number;
  offset?: number;
}

interface Positioned extends Node {
  position?: { start: Point; end: Point };
}

/** The container prefix a callout's continuation lines carry. */
const LINE_PREFIX = /^[ \t]*(?:>[ \t]?)*/u;

/**
 * Consuming text off the front of a node without moving its start leaves the
 * node claiming a span it no longer reproduces, which is what lets a formatter
 * splice by position and delete the part that was consumed. The marker sits on
 * one line, so the column moves with the offset.
 */
function advanceStart(node: Node, by: number): void {
  const start = (node as Positioned).position?.start;
  if (!start || start.offset === undefined) return;
  start.offset += by;
  start.column += by;
}

/** Where the line holding `offset` begins, so a column can be counted from it. */
function columnAt(source: string, offset: number): number {
  return offset - (source.lastIndexOf("\n", offset - 1) + 1) + 1;
}

function moveStartTo(node: Node, source: string, offset: number, line: number) {
  const position = (node as Positioned).position;
  if (!position) return;
  position.start = { line, column: columnAt(source, offset), offset };
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
export function calloutTransform(tree: Root, source = ""): void {
  visit(tree, "blockquote", (node: Node) => {
    const quote = node as Blockquote;
    const first = quote.children[0];
    if (!first || first.type !== "paragraph") return;

    const paragraph = first as Paragraph;
    const lead = paragraph.children[0];
    if (!lead || lead.type !== "text") return;

    const match = MARKER.exec((lead as Text).value);
    if (!match) return;
    if (match[1]!.trim() === "") return;

    const from = paragraph.position?.start?.offset;
    if (source !== "" && from !== undefined) {
      const lineStart = source.lastIndexOf("\n", from - 1) + 1;
      if (!MARKER_COLUMN.test(source.slice(lineStart))) return;
    }

    const [consumed, calloutType, fold] = match;
    (lead as Text).value = (lead as Text).value.slice(consumed.length);
    advanceStart(lead, consumed.length);

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
      // Up to the newline the value and the source still run together, since
      // the first line carries no prefix of its own. Past it they diverge, so
      // the body's start is found in the source rather than counted in the
      // value: a continuation line spends characters on `> ` that the value
      // never held.
      const titleStart = (leadText as Positioned).position?.start;
      const titleEnd =
        titleStart?.offset === undefined
          ? undefined
          : titleStart.offset + newlineAt;
      const bodyStart =
        titleEnd === undefined
          ? undefined
          : titleEnd +
            1 +
            (LINE_PREFIX.exec(source.slice(titleEnd + 1))?.[0].length ?? 0);

      titleNodes =
        leadText.value.slice(0, newlineAt).trim() === ""
          ? []
          : [
              {
                type: "text",
                value: leadText.value.slice(0, newlineAt),
                ...(titleStart && titleEnd !== undefined
                  ? {
                      position: {
                        start: { ...titleStart },
                        end: {
                          line: titleStart.line,
                          column: titleStart.column + newlineAt,
                          offset: titleEnd,
                        },
                      },
                    }
                  : {}),
              } as Text,
            ];
      leadText.value = leadText.value.slice(newlineAt + 1);
      if (leadText.value === "") paragraph.children.shift();
      else if (bodyStart !== undefined && titleStart) {
        moveStartTo(leadText, source, bodyStart, titleStart.line + 1);
        moveStartTo(paragraph, source, bodyStart, titleStart.line + 1);
      }
    } else {
      const breakAt = paragraph.children.findIndex((c) => c.type === "break");
      titleNodes =
        breakAt === -1
          ? paragraph.children.slice()
          : paragraph.children.slice(0, breakAt);
      paragraph.children =
        breakAt === -1 ? [] : paragraph.children.slice(breakAt + 1);
      // The kept children carry their own spans, so the paragraph follows the
      // first of them rather than still beginning at the marker.
      const first = paragraph.children[0] as Positioned | undefined;
      const start = first?.position?.start;
      if (start?.offset !== undefined && paragraph.position) {
        paragraph.position.start = { ...start };
      }
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
      const head = (titleNodes[0] as Positioned | undefined)?.position?.start;
      const tail = (titleNodes[titleNodes.length - 1] as Positioned | undefined)
        ?.position?.end;
      quote.children.unshift({
        type: "calloutTitle",
        children: titleNodes,
        ...(head && tail ? { position: { start: head, end: tail } } : {}),
      } as unknown as (typeof quote.children)[number]);
    }

    const callout = node as unknown as Callout;
    callout.type = "callout";
    callout.calloutType = (calloutType ?? "").trim();
    callout.title = title;
    callout.collapsed = fold === "-" ? true : fold === "+" ? false : null;
  });
}
