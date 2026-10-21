import type { Html, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import type { Comment } from "./types.js";

const OPENS_BLOCK = /\n\[\^[^\]\n]*\]:/u;
const BLANK_LINE = /\n[ \t]*\n/u;
const SHIELDS = new Set(["inlineCode", "code"]);

interface Point {
  line: number;
  column: number;
  offset?: number;
}

export interface Region {
  readonly start: number;
  readonly end: number;
  readonly closed: boolean;
}

/**
 * Pair comment markers over the raw source.
 *
 * Obsidian pairs `%%` lexically: the first opens, the next closes, and block
 * structure has no say. Ours is a micromark construct, so a container can
 * swallow an opener as ordinary content — a definition's indented `    %%`
 * becomes part of the definition — and then the *closer* is read as the next
 * opener. Every marker after that is paired one position out.
 *
 * No transform over the resulting tree can repair that, because the tree no
 * longer records where the regions were. Recomputing them from source does.
 */
function regionsFor(
  source: string,
  open: string,
  close: string,
  closes: (source: string, opener: number, closer: number) => boolean = () =>
    true,
): Region[] {
  const found: Region[] = [];
  let from = 0;

  while (from < source.length) {
    const at = source.indexOf(open, from);
    if (at === -1) break;

    let shut = source.indexOf(close, at + open.length);
    // Not every occurrence of the closing text can CLOSE this opener. `closes` rejects one and
    // the scan moves to the next; when none is acceptable the region is unclosed, which is the
    // correct answer rather than a failure. Defaults to accepting, so `<!--`/`-->` is untouched.
    while (shut !== -1 && !closes(source, at, shut)) {
      shut = source.indexOf(close, shut + close.length);
    }
    if (shut === -1) {
      found.push({ start: at, end: source.length, closed: false });
      break;
    }
    found.push({ start: at, end: shut + close.length, closed: true });

    // Scanning resumes on the next line, not straight after the closer. A
    // comment that ends mid-line leaves the rest of that line as a block, and
    // a marker inside it is literal — `%%⏎line %% nested %% line⏎%%` closes on
    // the second marker, keeps ` nested %% line` as prose, and opens again
    // only on the following line.
    const newline = source.indexOf("\n", shut + close.length);
    if (newline === -1) break;
    from = newline + 1;
  }

  return found;
}

/**
 * A block comment opens on a line that is spaces, `%%`, and no further `%`.
 *
 * Measured: `%% 50%` and `%%%` are both ordinary paragraphs in Obsidian, so
 * the opener is not simply "a line beginning with `%%`" -- any other percent
 * on that line disqualifies it. That also, correctly, rejects a self-closing
 * `%% a %%`, which is an inline comment and belongs to the text construct
 * rather than to a block region.
 *
 * Container prefixes come first: `> %%` opens one inside a quote, which the
 * first version of this anchor rejected and broke.
 */
const BLOCK_OPENER = /^(?:[ \t]*>)*[ \t]*%%[^%\n]*$/u;

/**
 * Four columns of indentation makes the opener indented CODE, so it opens nothing.
 *
 * `BLOCK_OPENER` admits any leading whitespace, which is right for one to three columns and
 * wrong at four: there the line is a code block like any other and the `%%` is literal. We
 * opened a region anyway and it ran to the end of the note, swallowing every definition below
 * it. Eight probes against live 1.14.4 fix the threshold exactly, and it holds at root and
 * after a quote alike:
 *
 *     > x / ⟨3sp⟩%% / [^1]: def        comment@1, NO definition
 *     > x / ⟨6sp⟩%% / [^1]: def        code@1, definition at 2:0
 *     > x / ⇥%%     / [^1]: def        code@1, definition at 2:0  -- a tab reaches the stop
 *     ⟨3sp⟩%% / [^1]: def              comment@0, no definition
 *     ⟨6sp⟩%% / [^1]: def              code@0, definition at 1:0
 *
 * Measured from after the quote markers, since a quote's own prefix is not indentation -- the
 * rule `line-map.ts` and `quote-indented-code.ts` both carry, and CommonMark example 252
 * enforces.
 */
const QUOTE_RUN = /^(?:[ \t]*>[ \t]?)*/u;
const DEFINITION_LABEL = /^ {0,3}\[\^[^\]]*\]:/u;

/**
 * UNLESS IT CONTINUES A FOOTNOTE DEFINITION, whose content column is already 4.
 *
 * Indented code is four columns past the CONTAINING BLOCK's content column, not past zero, and
 * a definition's content sits at four. So `[^1]: one` / `⟨4sp⟩%%` is at relative indent ZERO
 * and really does open a comment -- Obsidian spans that definition through the closing `%%`.
 * Measuring from column zero broke `hunt/definition-block-owns-region-opener/0` and `/2`, the
 * only two corpus regressions this rule caused.
 *
 * `commentRegions` reads the SOURCE and has no tree, so the containing block is recovered the
 * only way available: an unbroken run of non-blank lines back to a label at indent under four.
 * A blank line ends a definition's content, which is what separates the two probe families --
 * `x` / blank / `⟨6sp⟩%%` is code because the blank closed the paragraph, while
 * `[^1]: one` / `⟨4sp⟩%%` continues the definition directly.
 */
function continuesDefinition(
  source: string,
  lineStart: number,
  indent: number,
): boolean {
  if (indent < 4) return false;
  let at = lineStart;
  while (at > 0) {
    const previousEnd = at - 1;
    const previousStart = source.lastIndexOf("\n", previousEnd - 1) + 1;
    const previous = source.slice(previousStart, previousEnd);
    if (previous.trim() === "") return false;
    if (DEFINITION_LABEL.test(previous)) return true;
    at = previousStart;
  }
  return false;
}

function openerIndent(line: string): number {
  const body = line.slice(QUOTE_RUN.exec(line)?.[0].length ?? 0);
  let column = 0;
  for (const character of body) {
    if (character === " ") column += 1;
    else if (character === "\t") column += 4 - (column % 4);
    else break;
  }
  return column;
}

/** Entirely empty: no spaces, no quote marker. A `>`-only line keeps its quote open. */
const EMPTY_LINE = /^[ \t]*$/u;

/**
 * A comment opened inside a QUOTE cannot close past a line that ends the quote.
 *
 * An unquoted empty line ends a blockquote, so the quote below it is a NEW one and a `%%`
 * opened in the first cannot reach a closer in the second. Obsidian keeps the definition
 * between them live; we buried it, because the region spanned both quotes. Eight probes against
 * live 1.15.0 bound the rule exactly, and only the first diverged:
 *
 *     > %% / BLANK / > [^1]: def / > %%    DEFINES   <- this, 11 documents
 *     > %% / > [^1]: def / > %%            buries    no blank, one quote
 *     > %% / > / > [^1]: def / > %%        buries    a `>`-only line keeps the quote OPEN
 *     %% / BLANK / [^1]: def / %%          buries    at ROOT a blank ends nothing
 *     %% / [^1]: def / %%                  buries
 *     - %% / BLANK / - [^1]: def / - %%    DEFINES   already right
 *     > %% / BLANK / > [^1]: def           DEFINES   already right, unclosed
 *     %% / BLANK / [^1]: def               buries    already right, unclosed at root
 *
 * Three of those are what make it narrow. The root rows say a blank line is not a general
 * terminator -- at top level an unclosed comment runs to the end of the note, blank lines and
 * all, which a committed golden pins. The `>`-only row says the test is EMPTINESS, not
 * blankness: that line still carries the quote. And the list row says the rule is about the
 * QUOTE, not about containers generally.
 *
 * Rejecting the closer leaves the region UNCLOSED, which is the right shape rather than a
 * fallback: `commentQuoteExtentTransform` already bounds an unclosed comment to its quote, and
 * that is exactly the extent Obsidian reports.
 */
function closesQuotedComment(
  source: string,
  opener: number,
  closer: number,
): boolean {
  const openerLineStart = source.lastIndexOf("\n", opener - 1) + 1;
  const openerLineEnd = source.indexOf("\n", opener);
  const openerLine = source.slice(
    openerLineStart,
    openerLineEnd === -1 ? source.length : openerLineEnd,
  );
  if (!/^[ \t]{0,3}>/u.test(openerLine)) return true;
  return !source
    .slice(openerLineEnd === -1 ? source.length : openerLineEnd + 1, closer)
    .split("\n")
    .some((line) => EMPTY_LINE.test(line));
}

export function commentRegions(source: string): Region[] {
  return regionsFor(source, "%%", "%%", closesQuotedComment).filter(
    (region) => {
      const lineStart = source.lastIndexOf("\n", region.start - 1) + 1;
      const lineEnd = source.indexOf("\n", region.start);
      const line = source.slice(
        lineStart,
        lineEnd === -1 ? source.length : lineEnd,
      );
      if (!BLOCK_OPENER.test(line)) return false;
      const indent = openerIndent(line);
      return indent < 4 || continuesDefinition(source, lineStart, indent);
    },
  );
}

/**
 * `<!--` is **not** paired the way `%%` is, and assuming otherwise is wrong in
 * two measured ways. `%%` is Obsidian's own construct; `<!--` is a CommonMark
 * HTML block, so it answers to block structure that `%%` ignores:
 *
 * - it does not pair across a blank line, so `x <!--` / blank / `hidden` /
 *   blank / `--> after` is not a comment;
 * - an opener inside a link or footnote label is literal, so neither
 *   `see[^a<!--x-->b].` nor `body [^c<!--d] … ⏎--> end` is one either.
 */
export function htmlCommentRegions(source: string): Region[] {
  return regionsFor(source, "<!--", "-->").filter(
    (region) =>
      !BLANK_LINE.test(source.slice(region.start, region.end)) &&
      !insideLabel(source, region.start),
  );
}

/** Whether an unclosed `[` sits before `at` on the same line. */
function insideLabel(source: string, at: number): boolean {
  let depth = 0;
  for (let index = at - 1; index >= 0; index--) {
    const character = source[index];
    if (character === "\n") break;
    if (character === "]") depth++;
    else if (character === "[") {
      if (depth === 0) return true;
      depth--;
    }
  }
  return false;
}

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

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index++) {
    if (source[index] === "\n") line++;
  }
  return line;
}

interface Shape {
  readonly regions: Region[];
  /** True when the tree already represents this region correctly. */
  readonly settled: (region: Region) => boolean;
  readonly build: (start: number, end: number) => RootContent;
}

/**
 * Rebuild the document around a region whose opener a container swallowed.
 *
 * The block holding the opener keeps the text before it, takes the whole region
 * as a hidden child and ends where the region ends — which is what makes
 * Obsidian report one section spanning both. Everything after the region is
 * re-parsed, since the mis-pairing had consumed it into a bogus block.
 */
export function commentRegionTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  const commentStarts = new Set<number>();
  const spans = new Set<string>();
  const shielded: Array<[number, number]> = [];
  const htmlSpans: Array<[number, number]> = [];
  const commentSpans: Array<[number, number]> = [];

  visit(tree, (node: Node) => {
    const from = node.position?.start?.offset;
    const to = node.position?.end?.offset;
    if (from === undefined || to === undefined) return;
    spans.add(`${from}:${to}`);
    if (SHIELDS.has(node.type)) shielded.push([from, to]);
    if (node.type === "comment") {
      commentStarts.add(from);
      commentSpans.push([from, to]);
    }
    if (node.type === "html") htmlSpans.push([from, to]);
  });

  const isShielded = (at: number): boolean =>
    shielded.some(([from, to]) => at >= from && at < to);

  const shapes: Shape[] = [
    {
      regions: commentRegions(source),
      // A comment already spanning the region exactly is correct. The
      // mis-pairing shows up as a comment that touches the region — at its
      // start or at its closer — but does not cover it. Requiring that contact
      // keeps a `%%` shielded by a code span or fence, where no comment node
      // exists at all, from being rewritten into one.
      settled: ({ start, end }) =>
        spans.has(`${start}:${end}`) ||
        (!commentStarts.has(start) && !commentStarts.has(end - 2)),
      build: (start, end) => buildComment(source, start, end),
    },
    {
      regions: htmlCommentRegions(source),
      // A swallowed `<!--` still produces an `html` node, but only for the
      // four-character opener, so "a node starts here" means nothing. What
      // counts is whether one *covers* the region -- and covering means
      // containing it, not matching it exactly, which is what this used to test.
      //
      // A correct type-2 html block runs to the end of the line holding its `-->`,
      // so `- <!-- x --> visible` is one html node spanning past the closer. Exact
      // equality called that unsettled and rebuilt it into a node stopping at the
      // closer, which emptied the list item and pushed ` visible` out to the root.
      // Containment still rejects the four-character opener this pass exists for.
      // A `<!-- ... -->` INSIDE a `%%` comment is already represented, as that comment's own
      // text. Rebuilding around it cut the comment node at the opener and promoted the html to a
      // root sibling, which released everything below it:
      //
      //     %% / `Text <!-- x -->` / [^a]: def     comment 1:1-2:6, html at root, `a` DEFINED
      //     %% / `Text`            / [^a]: def     comment 1:1-4:1, `a` buried -- the control
      //
      // Obsidian buries the label in both. The same cut ran the other way with a CLOSED `%%`,
      // where the real closer was then read as an opener and buried a label Obsidian keeps, so
      // one containment test fixes both directions.
      settled: ({ start, end }) =>
        spans.has(`${start}:${end}`) ||
        isShielded(start) ||
        htmlSpans.some(([from, to]) => from <= start && to >= end) ||
        commentSpans.some(([from, to]) => from <= start && to >= end),
      build: (start, end) => buildHtml(source, start, end),
    },
  ];

  for (const shape of shapes) {
    for (const region of shape.regions) {
      // An unclosed region does not run to the end of the note swallowing
      // later blocks: `> %%` alone leaves a definition further down alive.
      if (!region.closed) continue;
      // Nor does one swallow a line that opens a block of its own. In
      // `[^9]: orphan` / `    %%` / `[^1]: one` / `%%` Obsidian reports two
      // definitions and no comment, where the same shape over plain prose is
      // one definition holding the whole region.
      if (OPENS_BLOCK.test(source.slice(region.start, region.end))) continue;
      if (shape.settled(region)) continue;
      if (rebuild(tree, source, reparse, region, shape.build)) return;
    }
  }
}

function buildComment(source: string, start: number, end: number): RootContent {
  const comment: Comment = {
    type: "comment",
    value: source.slice(start + 2, Math.max(start + 2, end - 2)),
    position: {
      start: { line: lineAt(source, start), column: 1, offset: start },
      end: { line: lineAt(source, end), column: 1, offset: end },
    },
  };
  return comment as unknown as RootContent;
}

function buildHtml(source: string, start: number, end: number): RootContent {
  const html: Html = {
    type: "html",
    value: source.slice(start, end),
    position: {
      start: { line: lineAt(source, start), column: 1, offset: start },
      end: { line: lineAt(source, end), column: 1, offset: end },
    },
  };
  return html;
}

function rebuild(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
  { start, end }: Region,
  build: (start: number, end: number) => RootContent,
): boolean {
  const children = tree.children;

  const host = children.findIndex((node) => {
    const from = node.position?.start?.offset;
    const to = node.position?.end?.offset;
    return from !== undefined && to !== undefined && from < start && to > start;
  });
  if (host === -1) return false;

  const from = children[host]!.position!.start!.offset!;
  const before = reparse(source.slice(from, start));
  if (before.children.length === 0) return false;

  for (const node of before.children)
    shift(node, from, lineAt(source, from) - 1);

  const hidden = build(start, end);
  const owner = before.children[before.children.length - 1] as RootContent & {
    children?: RootContent[];
  };
  if (Array.isArray(owner.children)) {
    owner.children.push(hidden as never);
    if (owner.position) owner.position.end = { ...hidden.position!.end };
  } else {
    before.children.push(hidden);
  }

  const after = reparse(source.slice(end));
  for (const node of after.children) shift(node, end, lineAt(source, end) - 1);

  // Everything from the host onward is replaced, not just what overlaps the
  // region: `after` re-parses the whole remainder, so leaving the original
  // trailing blocks in place duplicates them.
  children.splice(
    host,
    children.length - host,
    ...(before.children as RootContent[]),
    ...(after.children as RootContent[]),
  );
  return true;
}
