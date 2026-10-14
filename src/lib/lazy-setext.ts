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
    const owned = source.slice(pFrom, pTo).split("\n").map(stripQuotes);
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
    pruneEmptied(container, keepTo);

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

/**
 * Drop whatever the departing line was ALL of.
 *
 * `keepTo` is one offset before the content line starts, so a node beginning AT that line
 * has nothing left once the line leaves to become a heading. Setting its end to `keepTo`
 * therefore gave it a start one PAST its end:
 *
 *     > [!note] title / [^1]: def / ---   footnoteDefinition 16 -> 15
 *     > quote / [^1]: def / ---           text 8 -> 7
 *
 * In both the number is exact -- start is `contentFrom`, end is `contentFrom - 1` -- which is
 * what identified this pass rather than one of the forty others in the chain. The callout
 * case arises because the callout absorbs the definition as lazy content and
 * `lastParagraphHost` then descends INTO it, so the node being shrunk is the one whose whole
 * body is the departing line.
 *
 * A start after an end is categorically broken, not merely odd: `invariants.test.ts` tests
 * for it before anything else, and a splice-by-offset consumer such as `obsidian-linter`
 * cannot order an edit against a negative span.
 *
 * Removing rather than clamping is what Obsidian's own answer asks for. A definition absorbed
 * as a container's lazy content is NOT a definition to it -- `defs` is empty for the callout
 * case where we reported one -- so the node should not survive the line it was made of.
 */
function pruneEmptied(parent: RootContent, keepTo: number): void {
  const node = parent as unknown as { children?: RootContent[] };
  if (!Array.isArray(node.children)) return;

  for (let index = node.children.length - 1; index >= 0; index--) {
    const child = node.children[index]!;
    pruneEmptied(child, keepTo);
    const start = child.position?.start?.offset;
    // Strictly past the cut, so a node ENDING at `keepTo` is untouched.
    if (start !== undefined && start > keepTo) node.children.splice(index, 1);
  }
}

/**
 * The node whose children hold the quote's trailing paragraph, at any DEPTH.
 *
 * It used to return the container itself, which is only right at one level of nesting:
 * `> > quote` / `title` / `===` has an inner `blockquote` as the outer one's last child, so
 * the paragraph test below failed and the whole pass declined -- leaving the lazy lines
 * absorbed where Obsidian reports a root `heading@1`. Obsidian's answer is IDENTICAL at both
 * depths, so the depth-sensitivity was entirely ours. `compose.mts --nested` found it in four
 * of its six nestings.
 */
function lastParagraphHost(
  container: RootContent,
): { children: RootContent[]; position?: Node["position"] } | null {
  const host = container as unknown as { children?: RootContent[] };
  if (!Array.isArray(host.children)) return null;

  const last = host.children[host.children.length - 1];
  if (last && last.type !== "paragraph") {
    const deeper = lastParagraphHost(last);
    if (deeper) return deeper;
  }
  return host as { children: RootContent[]; position?: Node["position"] };
}

/**
 * Strip a RUN of quote markers from a line, not just one.
 *
 * A nested quote spends two prefixes on every line, so a single replace left `> ` on the
 * front of the kept text and the rebuilt paragraph carried a stray marker. Written as a
 * counting loop because the pattern form `(?:>[ \t]?)+` is a quantifier inside a quantifier
 * and the ReDoS lint rejects it -- the same substitution `container-lazy.ts` and
 * `mdast/wikilink.ts` already record for `\s+$`.
 */
function stripQuotes(line: string): string {
  let rest = line.replace(/^[ \t]+/u, "");
  while (rest.startsWith(">")) {
    rest = rest.slice(1);
    if (rest.startsWith(" ") || rest.startsWith("\t")) rest = rest.slice(1);
    rest = rest.replace(/^[ \t]+/u, "");
  }
  return rest;
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
