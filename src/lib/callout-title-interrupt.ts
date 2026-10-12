import type { List, Paragraph, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface Point {
  line: number;
  column: number;
  offset: number;
}

/** An ordered marker and its separator, with the start number captured. */
const ORDERED = /^[ \t]*(\d{1,9})[.)][ \t]/u;

function shift(node: unknown, offset: number, line: number): void {
  const candidate = node as {
    position?: { start: Point; end: Point };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.offset = offset + (point.offset ?? 0);
      point.line += line;
    }
  }
  for (const child of candidate.children ?? []) shift(child, offset, line);
}

/**
 * A callout title is not a paragraph, so an ordered item below it opens a list.
 *
 * CommonMark lets an ordered item interrupt a paragraph only when it starts at 1, and
 * `obsidian-flavored-markdown` forces a newline after a callout title -- so micromark sees
 * the title as a paragraph and `> [!note] title` / `> 2. item` keeps `2. item` as text. In
 * Obsidian the title line closes its own block, so the marker has nothing to interrupt and
 * the list opens whatever its start number.
 *
 * Measured by `probe/title-interrupt/*`, and the two controls are what make it a rule about
 * the TITLE rather than about the marker:
 *
 *     > [!note] title / > 2. item    a list, text `title item`
 *     > text          / > 2. item    NO list, text `text 2. item`   <- a quote's first
 *                                                                      line IS a paragraph
 *     > [!note] title / > 1. item    a list, as it already was      <- 1 always interrupts
 *
 * Both controls already matched and must keep doing so, which is why this fires only on a
 * `calloutTitle`'s immediate sibling and leaves every start of 1 to micromark.
 *
 * Restricted to a SINGLE-LINE paragraph, as the evidence is. A marker whose item continues
 * onto further lines is not probed, and re-parsing a multi-line paragraph would decide how
 * much the item swallows on no measurement at all.
 *
 * This is A2c, the last of the five gaps the sibling project's rules document exposed, and
 * the only one with no instance in the referee corpus -- so the corpus is the sole oracle
 * for it.
 */
export function calloutTitleInterruptTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  visit(tree, "callout", (node: Node) => {
    const callout = node as unknown as { children: RootContent[] };
    const title = callout.children[0];
    const next = callout.children[1];
    if (title?.type !== "calloutTitle" || next?.type !== "paragraph") return;

    const titleLine = title.position?.start?.line;
    const from = next.position?.start?.offset;
    const startLine = next.position?.start?.line;
    const endLine = next.position?.end?.line;
    if (titleLine === undefined || from === undefined) return;
    if (startLine === undefined || endLine === undefined) return;

    // Directly below the title, and one line only.
    if (startLine !== titleLine + 1 || endLine !== startLine) return;

    const nl = source.indexOf("\n", from);
    const text = source.slice(from, nl === -1 ? undefined : nl);
    const ordered = ORDERED.exec(text);
    if (!ordered) return;
    // A start of 1 interrupts a paragraph already, so micromark has built the list and
    // reaching in here would rebuild what is right.
    if (ordered[1] === "1") return;

    const parsed = reparse(text).children[0];
    if (parsed?.type !== "list") return;
    for (const child of [parsed]) shift(child, from, startLine - 1);

    callout.children[1] = parsed as List satisfies RootContent;
    void (next satisfies Paragraph);
  });
}
