import type { Heading, Paragraph, Root, RootContent } from "mdast";
import type { Node } from "unist";

/** A bare underline run, as `remark-parse@8` accepts one. */
const UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/u;
/** A line that continues a quote rather than lazily following it. */
const QUOTED = /^[ \t]*>/u;

const CONTAINERS = new Set(["blockquote", "callout"]);

/** Move a node and its descendants by a flat offset. */
function shiftOnto(node: unknown, offset: number): void {
  const candidate = node as {
    position?: { start: { offset?: number }; end: { offset?: number } };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.offset = offset + (point.offset ?? 0);
    }
  }
  for (const child of candidate.children ?? []) shiftOnto(child, offset);
}

/**
 * A setext underline takes a quote's last lazy line away from it.
 *
 * `> a` / `b` / `---` is a blockquote holding only `a` in Obsidian, with `b` and
 * the underline forming a heading at root. CommonMark instead lazily continues
 * `b` into the quote and leaves the run as a thematic break, so the heading never
 * appears.
 *
 * Three details are measured by `probe/lazy-setext/*` rather than assumed, and
 * each of them is a case this would otherwise get wrong:
 *
 * - Only the **last** lazy line leaves. `> a` / `b` / `c` / `---` keeps `b` in the
 *   quote and heads `c`, so this takes one line and not the whole lazy run.
 * - A line that is actually quoted never leaves, which is what makes `> a` / `---`
 *   a quote plus a thematic break and `> a` / `===` a quote that absorbs the run.
 *   Both already matched and both must keep doing so.
 * - A **list** is the other way round: it absorbs its lazy line and leaves the
 *   underline a thematic break. That half lives in `container-lazy.ts`, which is
 *   why this is restricted to a quote and a callout.
 *
 * The underline arrives in two shapes. A dash run is also a thematic break, so
 * micromark leaves it as the quote's next sibling; `===` has no second reading and
 * is lazily absorbed into the quote's own paragraph instead.
 */
export function lazySetextTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  const children = tree.children;

  for (let index = children.length - 1; index >= 0; index--) {
    const container = children[index];
    if (!container || !CONTAINERS.has(container.type)) continue;

    const from = container.position?.start?.offset;
    const to = container.position?.end?.offset;
    if (from === undefined || to === undefined) continue;

    // Trailing whitespace trimmed before the lines are counted. A container's
    // span can run past its last character -- an absorbed `===` left the span
    // ending on the newline after it, so the final "line" was empty and the
    // underline test looked at that instead of the run.
    // `trimEnd` rather than a trailing `\s+$` match: same characters, and the
    // ReDoS lint rejects the pattern form as quadratic. `container-lazy.ts` and
    // `mdast/wikilink.ts` record the same substitution.
    const span = source.slice(from, to).trimEnd();
    const spanEnd = from + span.length;
    const lines = span.split("\n");
    const sibling = children[index + 1];
    const siblingFrom = sibling?.position?.start?.offset;
    const siblingTo = sibling?.position?.end?.offset;

    // Which line heads, and where the underline ends.
    let marker: string;
    let contentIndex: number;
    let headingEnd: number;
    if (UNDERLINE.test(lines[lines.length - 1] ?? "")) {
      marker = lines[lines.length - 1]!.trim();
      contentIndex = lines.length - 2;
      headingEnd = spanEnd;
    } else if (
      sibling?.type === "thematicBreak" &&
      siblingFrom !== undefined &&
      siblingTo !== undefined &&
      // Adjacent, so a blank line between them still ends the quote.
      source.slice(spanEnd, siblingFrom).trim() === "" &&
      !source.slice(spanEnd, siblingFrom).includes("\n\n") &&
      UNDERLINE.test(source.slice(siblingFrom, siblingTo))
    ) {
      marker = source.slice(siblingFrom, siblingTo).trim();
      contentIndex = lines.length - 1;
      headingEnd = siblingTo;
    } else {
      continue;
    }

    const content = lines[contentIndex];
    if (content === undefined || contentIndex < 1) continue;
    if (QUOTED.test(content) || content.trim() === "") continue;

    const contentFrom =
      from + lines.slice(0, contentIndex).reduce((n, l) => n + l.length + 1, 0);

    // The quote keeps everything above the line that leaves.
    const keepTo = contentFrom - 1;
    const host = lastParagraphHost(container);
    if (!host) continue;
    const paragraph = host.children[host.children.length - 1] as
      Paragraph | undefined;
    if (paragraph?.type !== "paragraph") continue;

    // Rebuilt from the paragraph's own span, which it has even though its inline
    // children do not: at this point in the chain a multi-line paragraph is still
    // a single `text` node with no position, so neither an offset slice nor a
    // `break` count can find the boundary. Reparsing also handles a content line
    // that is not plain text -- `> [!` / `[[a|b]]` / `---` heads a wikilink.
    const drop = lines.length - contentIndex;
    const pFrom = paragraph.position?.start?.offset;
    const pTo = paragraph.position?.end?.offset;
    if (pFrom === undefined || pTo === undefined) continue;
    const owned = source
      .slice(pFrom, pTo)
      .split("\n")
      .map((line) => line.replace(/^[ \t]*>[ \t]?/u, ""));
    const keptLines = owned.slice(0, Math.max(owned.length - drop, 0));
    const keptText = keptLines.join("\n");

    if (keptText.trim() === "") {
      // The lazy line was the whole paragraph, as it is under a callout title.
      host.children.splice(host.children.indexOf(paragraph), 1);
    } else {
      const rebuilt = reparse(keptText).children[0];
      if (rebuilt?.type !== "paragraph") continue;
      for (const child of rebuilt.children) shiftOnto(child, pFrom);
      paragraph.children = rebuilt.children;
    }
    for (const node of [container, host, paragraph]) {
      if (node.position) node.position.end = { ...pointOf(source, keepTo) };
    }

    const inline = reparse(content).children[0];
    if (inline?.type === "paragraph") {
      for (const child of inline.children) shiftOnto(child, contentFrom);
    }
    const heading: Heading = {
      type: "heading",
      depth: marker.startsWith("=") ? 1 : 2,
      children: inline?.type === "paragraph" ? inline.children : [],
      position: {
        start: { ...pointOf(source, contentFrom) },
        end: { ...pointOf(source, headingEnd) },
      },
    };

    // Replaces the quote's trailing sibling too when that is where the run sat.
    children.splice(index + 1, headingEnd === spanEnd ? 0 : 1, heading);
  }
}

/** The node whose children hold the quote's trailing paragraph. */
function lastParagraphHost(
  container: RootContent,
): { children: RootContent[]; position?: Node["position"] } | null {
  const host = container as unknown as { children?: RootContent[] };
  if (!Array.isArray(host.children)) return null;
  return host as { children: RootContent[]; position?: Node["position"] };
}

/** Offsets are what matter; `normalizePointsTransform` rebuilds line and column. */
function pointOf(source: string, offset: number) {
  const before = source.slice(0, offset);
  const lastBreak = before.lastIndexOf("\n");
  return {
    line: before.split("\n").length,
    column: offset - lastBreak,
    offset,
  };
}
