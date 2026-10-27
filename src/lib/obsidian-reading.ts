import type { Content, List, Node, Paragraph, Parent, Root } from "mdast";
import type { Point } from "unist";
import { MARKER as CALLOUT_MARKER } from "./callout.js";

/**
 * Where a footnote definition starts and ends, as Obsidian reads it, for `strict`.
 *
 * Footnotes are in neither CommonMark nor GFM's spec, so `strict` follows Obsidian where its
 * reading departs from `remark-gfm`'s. Each rule below was settled against the live app (1.15.0,
 * 2026-10-27) one variable at a time, with `legacy` agreeing on every probe:
 *
 * 1. **A label cannot interrupt a paragraph.** Directly under a paragraph -- at root, in a list
 *    item or a quote, or lazily below one -- `[^1]: def` is more of that paragraph's text, as a
 *    link reference definition is in CommonMark. It can still follow another definition's text,
 *    which ends that definition, as GFM agrees.
 * 2. **What ends a definition's text:**
 *    - a `2.` or `2)` item does not -- it is more of the text, as it is under any paragraph --
 *      unless the definition sits in a list item;
 *    - a setext underline flush with the text (`---`, `===`, `-`, `=`) does: it makes the line
 *      above it a heading, so a label line directly above one is a heading and no definition;
 *    - a table or a link reference definition does, and becomes the definition's sibling.
 *
 * 3. **A `[^` label that is not a footnote's is text.** `[^a b]: x`, `[^]: x` and `[^a\]b]: d` are
 *    no footnote to Obsidian and no link reference definition either -- two plain paragraphs --
 *    where CommonMark, given the line once GFM's footnote reader declines it, defines a link.
 *
 * 5. **A `%%` opener is never a lazy line of a container** (their F4). A line that, after any
 *    spaces, opens a comment -- `%%` and nothing holding another `%` -- under a paragraph in a
 *    quote or list item, without the container's own prefix, ends the container: `> q` / `%%`
 *    is a quote and then a comment, and indented four or more it is root code (their F5), so
 *    `> x` / `····%%` / `[^1]: def` defines. Not under a definition, where `%%` is lazy text
 *    (their D5).
 *
 * 6. **A callout's title line stands alone** (their A2). The line under it starts a fresh block,
 *    so `> [!note]` / `>     code[^2]` is quoted code and `> [!note]` / `> 2. [^1]: def` a list:
 *    a blank quote line goes in after the title, where the next line carries the quote's own
 *    prefix. A LAZY next line stays the body paragraph's, as Obsidian has it.
 *
 * Not followed, by decision: the 1,024-character window in which remark-footnotes looks for what
 * ends a definition (an implementation limit), and the column 0 Obsidian reports for an indented
 * root definition (a position, which `strict` does not promise).
 *
 * The rules are applied by re-parsing the document from an EDITED copy that has the same line
 * structure, then mapping positions back. Two edits suffice, and neither touches what micromark
 * decides about anything else:
 *
 * - **neutralize** swaps one character for a private-use placeholder -- the `:` after a label, or
 *   the `.` or `)` of an ordered marker -- so the line is ordinary text; the character is
 *   restored in every value afterwards;
 * - **split** inserts one blank line, carrying the container prefix (`>`) where there is one, so
 *   the definition ends before the line that follows it.
 *
 * Repeats until nothing applies, since one edit can expose the next (`2.` then `3.`).
 */
export function obsidianReadingTransform(
  tree: Root,
  source: string,
  parse: (markdown: string) => Root,
  options: { readonly callouts: boolean; readonly comments: boolean },
): void {
  if (PLACEHOLDER_IN.test(source)) return;
  const lines = lineTable(source);
  const edits: Edit[] = [];
  const seen = new Set<string>();

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    // What detection reads: the source with this round's characters swapped, so a label already
    // turned into text reads as text. Same length, so every offset and line still holds.
    const view = lineTable(neutralized(source, edits));
    const found = detect(tree, source, view, parse, options).filter((edit) => {
      const key = `${edit.kind}@${String(edit.offset)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (found.length === 0) return;
    edits.push(...found);

    const edited = applyEdits(source, lines, edits);
    const fresh = parse(edited.text);
    mapBack(fresh, edited, lines);
    tree.children = fresh.children;
    if (fresh.position) tree.position = fresh.position;
    if (fresh.data) tree.data = fresh.data;
  }
}

function neutralized(source: string, edits: readonly Edit[]): string {
  let text = source;
  for (const edit of edits) {
    if (edit.kind !== "neutralize") continue;
    const placeholder = PLACEHOLDERS[source[edit.offset]!];
    if (placeholder === undefined) continue;
    text =
      text.slice(0, edit.offset) + placeholder + text.slice(edit.offset + 1);
  }
  return text;
}

/** Generous: each round fixes at least one shape, and real notes need one or two. */
const MAX_ROUNDS = 32;

const PLACEHOLDERS: Readonly<Record<string, string>> = {
  ":": "\uE000",
  ".": "\uE001",
  ")": "\uE002",
};
const RESTORE = new Map(
  Object.entries(PLACEHOLDERS).map(([char, placeholder]) => [
    placeholder,
    char,
  ]),
);
const PLACEHOLDER_IN = /[\uE000-\uE002]/u;
const PLACEHOLDER_ALL = /[\uE000-\uE002]/gu;

type Edit =
  | { readonly kind: "neutralize"; readonly offset: number }
  | { readonly kind: "split"; readonly offset: number; readonly text: string };

interface Lines {
  /** Offset of each line's first character; index 0 is line 1. */
  readonly starts: readonly number[];
  readonly text: readonly string[];
}

function lineTable(source: string): Lines {
  const starts: number[] = [0];
  const text: string[] = [];
  const pattern = /\r\n|\r|\n/gu;
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    text.push(source.slice(last, match.index));
    last = match.index + match[0].length;
    starts.push(last);
  }
  text.push(source.slice(last));
  return { starts, text };
}

const SETEXT_UNDERLINE = /^(?:=+|-+)$/u;
/** Their F1: after any spaces `%%`, and no other `%` anywhere on the line. */
const COMMENT_OPENER = /^%%[^%]*$/u;
/**
 * The whitespace in front of a lazy opener that still makes it one: spaces alone, or a leading
 * tab. One to three spaces and THEN a tab is no opener -- the line stays lazy text, so
 * `> x` / `·⇥%%` / `[^1]: def` is one quote and defines nothing -- while `⇥%%`, `⇥·%%` and
 * `····%%` end the quote as root code (live, 1.15.0).
 */
const OPENER_INDENT = /^(?:\t[ \t]*| *)$/u;

/** Whether a line opens a comment once its container's `>` markers are read off. */
function opensComment(text: string): { lead: string } | undefined {
  const lead = /^[> \t]*/u.exec(text)![0];
  if (!COMMENT_OPENER.test(text.slice(lead.length))) return undefined;
  return OPENER_INDENT.test(lead.slice(lead.lastIndexOf(">") + 1))
    ? { lead }
    : undefined;
}
const CONTAINERS = new Set(["blockquote", "listItem", "footnoteDefinition"]);
const CONTAINER_PREFIX = /^[> \t]*$/u;
const LINK_DEFINITION_HINT = /^ {0,3}\[(?!\^)[^\]]+\]:/u;

function detect(
  tree: Root,
  source: string,
  lines: Lines,
  parse: (markdown: string) => Root,
  options: { readonly callouts: boolean; readonly comments: boolean },
): Edit[] {
  const edits: Edit[] = [];
  /** Rule 5's splits, applied alone: ending a container changes which paragraphs are open. */
  const splits: Edit[] = [];
  /** Paragraphs with no definition among their ancestors, by the line they end on. */
  const openParagraphEnds = new Map<number, Paragraph[]>();
  /** Which of those open with a callout title, since callouts are built later. */
  const calloutTitles = new Set<Paragraph>();
  /** Ordered lists, by the line they start on, with the list item holding each. */
  const listStarts = new Map<number, Array<{ list: List; item?: Node }>>();
  const definitions: Array<{
    node: Parent;
    /** The nearest list item holding the definition. */
    item?: Node;
    /** The line the definition's container opened on; 0 for the root. */
    hostLine: number;
  }> = [];

  const walk = (
    node: Node,
    inDefinition: boolean,
    item: Node | undefined,
    hostLine: number,
    parent?: Parent,
    container?: string,
  ): void => {
    if (
      options.comments &&
      !inDefinition &&
      (container === "blockquote" || container === "listItem")
    ) {
      // A paragraph that absorbed the opener as lazy text, or a comment micromark opened on the
      // lazy line itself, inside the container.
      const split =
        node.type === "paragraph"
          ? lazyCommentOpener(node as Paragraph, lines)
          : node.type === "comment" && parent && parent.children[0] !== node
            ? lazyCommentNode(node, parent, lines)
            : undefined;
      if (split) splits.push(split);
    }
    if (node.type === "paragraph" && !inDefinition && node.position) {
      if (options.callouts && isCalloutTitle(node as Paragraph, parent)) {
        calloutTitles.add(node as Paragraph);
        const split = calloutBodySplit(node as Paragraph, lines);
        if (split) splits.push(split);
      }
      const end = node.position.end.line;
      openParagraphEnds.set(end, [
        ...(openParagraphEnds.get(end) ?? []),
        node as Paragraph,
      ]);
    }
    if (node.type === "list" && (node as List).ordered && node.position) {
      const start = node.position.start.line;
      listStarts.set(start, [
        ...(listStarts.get(start) ?? []),
        { list: node as List, item },
      ]);
    }
    if (
      node.type === "definition" &&
      (node as { label?: string }).label?.startsWith("^")
    ) {
      const colon = linkLabelColon(node as Parent, source);
      if (colon !== undefined)
        edits.push({ kind: "neutralize", offset: colon });
    }
    if (node.type === "footnoteDefinition") {
      definitions.push({ node: node as Parent, item, hostLine });
    }
    const children = (node as Partial<Parent>).children;
    if (!children) return;
    for (const child of children) {
      walk(
        child,
        inDefinition || node.type === "footnoteDefinition",
        node.type === "listItem" ? node : item,
        node.type === "root" ? 0 : (node.position?.start.line ?? 0),
        node as Parent,
        CONTAINERS.has(node.type) ? node.type : container,
      );
    }
  };
  walk(tree, false, undefined, 0);
  if (splits.length > 0) return splits;

  for (const { node: definition, item, hostLine } of definitions) {
    const position = definition.position;
    if (!position || position.start.offset === undefined) continue;
    const labelLine = position.start.line;
    const colon = labelColon(definition, source);
    const prefixLength =
      position.start.offset - (lines.starts[labelLine - 1] ?? 0);

    // Rule 1: directly under a paragraph that no definition holds. Not when the definition is the
    // first thing in a container that opened on its own line -- `para` / `- [^1]: def` is a list
    // item interrupting the paragraph, as CommonMark allows, and the label then interrupts
    // nothing.
    const above = (openParagraphEnds.get(labelLine - 1) ?? []).filter(
      (paragraph) =>
        (paragraph.position?.end.offset ?? Infinity) < position.start.offset! &&
        !(
          calloutTitles.has(paragraph) &&
          titleLeavesLabel(paragraph, labelLine, lines, parse)
        ),
    );
    if (colon !== undefined && hostLine < labelLine && above.length > 0) {
      edits.push({ kind: "neutralize", offset: colon });
      continue;
    }

    const children = definition.children as Content[];
    const first = children[0];
    const last = children[children.length - 1];

    // Rule 2, setext: the first flush underline below the label line's text.
    if (
      first?.type === "paragraph" &&
      first.position?.start.line === labelLine
    ) {
      const textEnd = first.position.end.line;
      for (let line = labelLine + 1; line <= textEnd + 1; line += 1) {
        const rest = restOf(lines, line, prefixLength);
        if (rest === undefined || !SETEXT_UNDERLINE.test(rest)) continue;
        if (line === labelLine + 1) {
          if (colon !== undefined) {
            edits.push({ kind: "neutralize", offset: colon });
          }
        } else {
          const split = splitBefore(lines, line - 1, prefixLength);
          if (split) edits.push(split);
        }
        break;
      }
    }

    // Rule 2, `2.`: an ordered list starting right below the text continues it -- unless the
    // line has left the definition's list item, where it is a list of its own (`- [^1]: a` /
    // `2. x`); inside the item it continues (`- > [^1]: a` / `  2. x`).
    if (last?.type === "paragraph" && last.position) {
      for (const { list, item: listItem } of listStarts.get(
        last.position.end.line + 1,
      ) ?? []) {
        if (list.start === 1 || list.start === null) continue;
        if (item !== undefined && listItem !== item) continue;
        const delimiter = orderedDelimiter(list, source);
        if (delimiter !== undefined) {
          edits.push({ kind: "neutralize", offset: delimiter });
        }
      }
    }

    // Rule 2, a table or a link reference definition inside the text ends it.
    for (const child of children) {
      if (child.type !== "paragraph" || !child.position) continue;
      const { start, end } = child.position;
      for (let line = start.line + 1; line <= end.line; line += 1) {
        const rest = restOf(lines, line, prefixLength);
        if (rest === undefined) continue;
        const next =
          line < end.line ? restOf(lines, line + 1, prefixLength) : undefined;
        if (startsBlock(rest, next, parse)) {
          const split = splitBefore(lines, line, prefixLength);
          if (split) edits.push(split);
          break;
        }
      }
    }
  }

  return edits;
}

/** A paragraph opening a quote with a callout marker: a callout's title, before callouts exist. */
function isCalloutTitle(
  paragraph: Paragraph,
  parent: Parent | undefined,
): boolean {
  if (parent?.type !== "blockquote" || parent.children[0] !== paragraph) {
    return false;
  }
  const lead = paragraph.children[0];
  return lead?.type === "text" && CALLOUT_MARKER.test(lead.value);
}

/**
 * Whether a callout's title leaves the label on `labelLine` to start a definition.
 *
 * Callouts are built later, so here the title is still a plain paragraph -- and CommonMark lets
 * it absorb the lines under it, since indented code cannot interrupt a paragraph. Obsidian ends
 * the title at its own line (the rule `calloutTitleInterruptTransform` carries), and
 * `calloutTransform` re-reads what follows as the callout's body. So the question is the body's:
 * read with the label line after it, does the label start a definition? `> [!note] Title` /
 * `> [^1]: def` defines, and so does a label under `> [!tip]` / `>     It`, whose body is code;
 * under `> <br>` it does not, since an HTML block runs to the next blank line, and under body
 * text it does not either, by rule 1.
 */
function titleLeavesLabel(
  paragraph: Paragraph,
  labelLine: number,
  lines: Lines,
  parse: (markdown: string) => Root,
): boolean {
  const position = paragraph.position;
  if (!position || position.start.offset === undefined) return false;
  const prefixLength =
    position.start.offset - (lines.starts[position.start.line - 1] ?? 0);
  const body: string[] = [];
  for (let line = position.start.line + 1; line <= labelLine; line += 1) {
    body.push(restOf(lines, line, prefixLength) ?? lines.text[line - 1] ?? "");
  }
  const blocks = parse(body.join("\n")).children;
  const label = blocks[blocks.length - 1];
  const before = blocks[blocks.length - 2];
  return (
    label?.type === "footnoteDefinition" &&
    label.position?.start.line === body.length &&
    !(
      before?.type === "paragraph" &&
      before.position?.end.line === body.length - 1
    )
  );
}

/** Columns, with a tab advancing to the next multiple of four. */
function columns(text: string): number {
  let column = 0;
  for (const character of text)
    column = character === "\t" ? column + 4 - (column % 4) : column + 1;
  return column;
}

/**
 * A blank line before the first `%%` opener that sits on a LAZY line of `paragraph`, which is in
 * a quote or list item: one carrying fewer `>` than the paragraph's own first line, or indented
 * short of where its content starts.
 */
function lazyCommentOpener(
  paragraph: Paragraph,
  lines: Lines,
): Edit | undefined {
  const position = paragraph.position;
  if (!position || position.start.offset === undefined) return undefined;
  const first = position.start.line;
  const prefix = (lines.text[first - 1] ?? "").slice(
    0,
    position.start.offset - (lines.starts[first - 1] ?? 0),
  );
  const quotes = prefix.split(">").length - 1;
  const width = columns(prefix);
  for (let line = first + 1; line <= position.end.line; line += 1) {
    const opener = opensComment(lines.text[line - 1] ?? "");
    if (!opener) continue;
    const { lead } = opener;
    const lazy = lead.split(">").length - 1 < quotes || columns(lead) < width;
    if (!lazy) continue;
    const offset = lines.starts[line - 1];
    return offset === undefined
      ? undefined
      : { kind: "split", offset, text: "" };
  }
  return undefined;
}

/** The prefix a container's lines carry, read off its first child's line: `>` count and width. */
function containerPrefix(
  container: Parent,
  lines: Lines,
): { quotes: number; width: number } | undefined {
  const start = container.children[0]?.position?.start;
  if (!start || start.offset === undefined) return undefined;
  const prefix = (lines.text[start.line - 1] ?? "").slice(
    0,
    start.offset - (lines.starts[start.line - 1] ?? 0),
  );
  return { quotes: prefix.split(">").length - 1, width: columns(prefix) };
}

/** A blank quote line after a callout's title, when the line under it is quoted like it. */
function calloutBodySplit(title: Paragraph, lines: Lines): Edit | undefined {
  const position = title.position;
  if (!position || position.start.offset === undefined) return undefined;
  const first = position.start.line;
  if (position.end.line === first) return undefined;
  const titlePrefix = (lines.text[first - 1] ?? "").slice(
    0,
    position.start.offset - (lines.starts[first - 1] ?? 0),
  );
  const next = lines.text[first] ?? "";
  const lead = /^[> \t]*/u.exec(next)![0];
  // Quoted as deeply as the title, or the line is lazy and the body paragraph keeps it.
  const depth = titlePrefix.split(">").length - 1;
  if (lead.split(">").length - 1 < depth) return undefined;
  const offset = lines.starts[first];
  if (offset === undefined) return undefined;
  // The blank line carries the NEXT line's own spelling of the containers, up to the title's
  // `>`: `\t> >` and `·····> >` can name the same containers at different widths, and copying
  // the title's ended the list item around them.
  let cut = 0;
  for (let seen = 0; cut < lead.length && seen < depth; cut += 1) {
    if (lead[cut] === ">") seen += 1;
  }
  return { kind: "split", offset, text: lead.slice(0, cut) };
}

/** A blank line before a comment that opened on a LAZY line of its container. */
function lazyCommentNode(
  comment: Node,
  container: Parent,
  lines: Lines,
): Edit | undefined {
  const line = comment.position?.start.line;
  const expected = containerPrefix(container, lines);
  if (line === undefined || !expected) return undefined;
  const opener = opensComment(lines.text[line - 1] ?? "");
  if (!opener) return undefined;
  const { lead } = opener;
  const lazy =
    lead.split(">").length - 1 < expected.quotes ||
    columns(lead) < expected.width;
  const offset = lines.starts[line - 1];
  return lazy && offset !== undefined
    ? { kind: "split", offset, text: "" }
    : undefined;
}

/** The offset of the `:` after a definition's label, checked against the source. */
function labelColon(definition: Parent, source: string): number | undefined {
  const start = definition.position?.start.offset;
  const label = (definition as Parent & { label?: string }).label;
  if (start === undefined || label === undefined) return undefined;
  const close = start + 2 + label.length;
  return source.slice(start, start + 2) === "[^" &&
    source[close] === "]" &&
    source[close + 1] === ":"
    ? close + 1
    : undefined;
}

/**
 * The offset of the `:` after a link reference definition's label. Read from the source, since
 * the node's `label` is decoded: `[^a\]b]` reports `^a]b`. CommonMark's label ends at the first
 * unescaped `]`.
 */
function linkLabelColon(
  definition: Parent,
  source: string,
): number | undefined {
  const start = definition.position?.start.offset;
  const end = definition.position?.end.offset;
  if (start === undefined || end === undefined) return undefined;
  // The node can start at the line's indentation; the label opens at the first `[`.
  const open = source.indexOf("[", start);
  if (open === -1 || open >= end) return undefined;
  for (let at = open + 1; at < end; at += 1) {
    if (source[at] === "\\") {
      at += 1;
    } else if (source[at] === "]") {
      return source[at + 1] === ":" ? at + 1 : undefined;
    }
  }
  return undefined;
}

/** The offset of an ordered list's first `.` or `)`. */
function orderedDelimiter(list: List, source: string): number | undefined {
  let at = list.position?.start.offset;
  if (at === undefined) return undefined;
  while (at < source.length && /[0-9]/u.test(source[at]!)) at += 1;
  return source[at] === "." || source[at] === ")" ? at : undefined;
}

/**
 * A line's content past the container prefix the definition sits behind, or `undefined` when
 * the line does not carry that prefix -- a lazy line inside a container, which these rules were
 * not probed on and so do not touch.
 */
function restOf(
  lines: Lines,
  line: number,
  prefixLength: number,
): string | undefined {
  const text = lines.text[line - 1];
  if (text === undefined) return undefined;
  const prefix = text.slice(0, prefixLength);
  if (prefix.length < prefixLength || !CONTAINER_PREFIX.test(prefix)) {
    return undefined;
  }
  return text.slice(prefixLength);
}

/** A blank line before `line`, inside the same containers. */
function splitBefore(
  lines: Lines,
  line: number,
  prefixLength: number,
): Edit | undefined {
  const text = lines.text[line - 1];
  const offset = lines.starts[line - 1];
  if (text === undefined || offset === undefined) return undefined;
  const prefix = text.slice(0, prefixLength);
  if (!CONTAINER_PREFIX.test(prefix)) return undefined;
  return { kind: "split", offset, text: prefix.trimEnd() };
}

/** Whether `rest` opens a link reference definition, or with `next` a table. */
function startsBlock(
  rest: string,
  next: string | undefined,
  parse: (markdown: string) => Root,
): boolean {
  if (LINK_DEFINITION_HINT.test(rest)) {
    if (parse(rest).children[0]?.type === "definition") return true;
  }
  if (next !== undefined && rest.includes("|") && next.includes("-")) {
    if (parse(`${rest}\n${next}`).children[0]?.type === "table") return true;
  }
  return false;
}

interface Edited {
  readonly text: string;
  /**
   * Each inserted line: where it sits in the edited text, how long it is, and the original line
   * (1-based) it was inserted before.
   */
  readonly insertions: ReadonlyArray<{
    readonly at: number;
    readonly length: number;
    readonly before: number;
  }>;
}

function applyEdits(
  source: string,
  lines: Lines,
  edits: readonly Edit[],
): Edited {
  const sorted = [...edits].sort((a, b) => a.offset - b.offset);
  let text = "";
  let cursor = 0;
  const insertions: Array<{ at: number; length: number; before: number }> = [];
  for (const edit of sorted) {
    text += source.slice(cursor, edit.offset);
    cursor = edit.offset;
    if (edit.kind === "neutralize") {
      text += PLACEHOLDERS[source[edit.offset]!] ?? source[edit.offset]!;
      cursor += 1;
    } else {
      const line = `${edit.text}\n`;
      insertions.push({
        at: text.length,
        length: line.length,
        before: lines.starts.indexOf(edit.offset) + 1,
      });
      text += line;
    }
  }
  text += source.slice(cursor);
  return { text, insertions };
}

/** Positions and values back into the source's own terms. */
function mapBack(tree: Root, edited: Edited, lines: Lines): void {
  const { insertions } = edited;

  const point = (p: Point, end: boolean): void => {
    if (p.offset === undefined) return;
    let shift = 0;
    let moved = 0;
    for (const insertion of insertions) {
      if (p.offset >= insertion.at + insertion.length) {
        shift += insertion.length;
        moved += 1;
        continue;
      }
      if (p.offset >= insertion.at) {
        // On an inserted line, which the source does not have. A container that the blank line
        // continued ends there, and it really ended with the line above; anything starting there
        // starts with the line below.
        const line = end ? insertion.before - 1 : insertion.before;
        const text = lines.text[line - 1] ?? "";
        const start = lines.starts[line - 1] ?? 0;
        p.line = line;
        p.column = end ? text.length + 1 : 1;
        p.offset = end ? start + text.length : start;
        return;
      }
      break;
    }
    p.offset -= shift;
    p.line -= moved;
  };

  const visit = (node: Node): void => {
    if (node.position) {
      point(node.position.start, false);
      point(node.position.end, true);
    }
    const record = node as unknown as Record<string, unknown>;
    for (const key of ["value", "url", "title", "alt", "label", "meta"]) {
      const value = record[key];
      if (typeof value === "string" && PLACEHOLDER_IN.test(value)) {
        record[key] = value.replace(
          PLACEHOLDER_ALL,
          (c) => RESTORE.get(c) ?? c,
        );
      }
    }
    for (const child of (node as Partial<Parent>).children ?? []) visit(child);
  };
  visit(tree);

  const offsets = (
    tree.data as { lineOffsets?: Record<number, number> } | undefined
  )?.lineOffsets;
  if (offsets && insertions.length > 0) {
    // Lines in the edited text: the inserted ones drop, the rest move up past them.
    const inserted = insertions.map(
      (insertion) => lineOfOffset(edited.text, insertion.at) + 1,
    );
    const remapped: Record<number, number> = {};
    for (const [key, value] of Object.entries(offsets)) {
      const line = Number(key);
      if (inserted.includes(line)) continue;
      remapped[line - inserted.filter((l) => l < line).length] = value;
    }
    (tree.data as { lineOffsets: Record<number, number> }).lineOffsets =
      remapped;
  }
}

/** Zero-based line of an offset. */
function lineOfOffset(text: string, offset: number): number {
  let line = 0;
  for (let at = 0; at < offset; at += 1) {
    if (text[at] === "\n") line += 1;
  }
  return line;
}
