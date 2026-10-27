import type { Root } from "mdast";

import { applyTextTransform, parseOurs } from "./chain.js";
import { computeOurs } from "./normalize.js";

export interface Point {
  readonly line: number;
  readonly column: number;
  readonly offset?: number;
}

/** `[name, line, column, lastLine]`, zero-based, as the recorded answers store it. */
export type Def = readonly [string, number, number, number];
/** `[name, line, column]`, zero-based. */
export type Ref = readonly [string, number, number];
/**
 * `[line, column, offset, endLine, endColumn, endOffset]`, zero-based, as the cache counts: a
 * fact's whole span, which `referee-spans.json` records beside the answers' tuples.
 */
export type Span = readonly [number, number, number, number, number, number];
/** An inline footnote as the cache names it, `[inline<n>`, with the span of its body. */
export type Inline = readonly [
  string,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface Facts {
  readonly defs: Def[];
  readonly refs: Ref[];
  /** Each fact's span, in the same order as `defs` and `refs`. */
  readonly defSpans: Span[];
  readonly refSpans: Span[];
  readonly unplaced: number;
}

/**
 * Our footnote facts in the shape the referee's recorded answers use.
 *
 * Shared by `referee.mts` and `referee-shrink.mts`, and extracted the moment that mattered.
 * It began as a deliberate duplication -- `referee.mts` is a script that runs its
 * measurement on import, so there was nothing to import from it, and one copy for one caller
 * is cheaper than a module. Then the commented-definition rule landed in `referee.mts` only,
 * and the shrinker spent a run reducing notes against behaviour three commits old: its
 * output was still dominated by `%%`-above-label forms the rule had already closed.
 *
 * **Duplication is fine for one caller and a defect for two that must agree.** The cost is
 * not the copy, it is that nothing makes the copies diverge loudly.
 *
 * Two rules are encoded here and both are measured:
 *
 * - A definition inside a `%%` comment does not define. `parseComments` puts a comment's
 *   body in its `children` as real nodes, so a plain `visit` counts the buried definition
 *   and reports every such note as one where we invent a definition Obsidian lacks -- 247 of
 *   this corpus's disagreements, none of them real.
 * - ...and its label is still indexed as a REFERENCE. `> %%` over `[^3]: Text` reports no
 *   definition and a reference at 1:0, because the quoted `%%` runs to the end of the note,
 *   the definition fails, and the name is indexed anyway. Measured at +123 documents against
 *   7, where all 7 are notes with a fence inside the comment and our comment extent differs
 *   from Obsidian's.
 */
/**
 * The same facts, with the tree they came from.
 *
 * `refereeFacts` parses a tree and discards it, which made `score.mts` unable to express any
 * rule needing container state -- it had to approximate "this line continues that item" with
 * a backward line scan, and every such approximation scored well on distance and badly on
 * agreement. Reading the tree is free, since it is already parsed; only MUTATING it is
 * order-dependent and expensive, and a scored rule still does neither.
 */
export function refereeFactsWithTree(
  text: string,
): Facts & { tree: Root; inline: Inline[] } {
  const tree = parseOurs(text, "all-features");
  // The tree's offsets count from after a byte-order mark, as Obsidian's do, so every slice
  // and every offset here is taken from the same mark-less source.
  const source = applyTextTransform(text);
  return { ...factsOf(tree, source), tree, inline: inlineOf(tree, source) };
}

/**
 * Inline footnotes as the cache reports them: `computeOurs`, which names each `[inline<n>` by
 * the markers before it and spans its body alone, with offsets read back off its `line:col`.
 */
export function inlineOf(tree: Root, source: string): Inline[] {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === "\n") lineStarts.push(index + 1);
  }
  const at = (point: string): [number, number, number] => {
    const [line, column] = point.split(":").map(Number) as [number, number];
    return [line, column, lineStarts[line]! + column];
  };
  return computeOurs(tree, source).footnotes.flatMap((row): Inline[] => {
    const match = /^(\[inline\d+)@(\d+:\d+)-(\d+:\d+)$/u.exec(row);
    return match ? [[match[1]!, ...at(match[2]!), ...at(match[3]!)]] : [];
  });
}

export function refereeFacts(text: string): Facts {
  return factsOf(parseOurs(text, "all-features"), applyTextTransform(text));
}

/**
 * Indented code, not a FENCE -- the node type cannot tell them apart.
 *
 * A bare ``` or ~~~ arrives as `code` with a null `lang` exactly as indented code does, which
 * `container-lazy.ts` records for the same reason. It matters here because Obsidian indexes a
 * label inside INDENTED code within a comment and does NOT index one inside a fence:
 *
 *     %%/⟨2sp⟩```/[^b]: Definition/⟨2sp⟩```        no reference
 *     %%/⟨4sp⟩[^4]: ...                            reference at 1:4
 *
 * Scanning both cost 12 documents against 19 gained; scanning only the indented form is what
 * makes the trade one-sided.
 */
export function isIndented(
  source: string,
  at: { start: Point; end: Point } | undefined,
): boolean {
  const from = at?.start?.offset;
  if (from === undefined) return false;
  const bol = source.lastIndexOf("\n", from - 1) + 1;
  const nl = source.indexOf("\n", from);
  const line = source.slice(bol, nl === -1 ? undefined : nl);
  return !/^[ \t>]*(?:```|~~~)/u.test(line);
}

/** A label, with no whitespace or bracket inside it -- the same shape `normalize.ts` scans. */
const LABEL = /\[\^([^[\]\s]+)\]/gu;

/** Zero-based line of an offset, as the referee counts them. */
function lineOf(source: string, offset: number): number {
  let line = 0;
  for (let index = 0; index < offset; index++) {
    if (source[index] === "\n") line += 1;
  }
  return line;
}

/** Zero-based column of an offset. */
function columnOf(source: string, offset: number): number {
  return offset - (source.lastIndexOf("\n", offset - 1) + 1);
}

/**
 * Exported so a caller holding a tree built with NON-DEFAULT flags can project it the same way.
 *
 * `ablate.mts` reparses each document once per flag and has to ask "is this the same answer the
 * referee would score?". Re-deriving the projection there would be a third copy of the two rules
 * encoded above, and this file's own history is the argument against that: the commented-
 * definition rule once lived in `referee.mts` alone and the shrinker spent a run measuring
 * behaviour three commits old.
 */
/**
 * Whether the label at `at` is literal: escaped, inside a backtick run, or inside a
 * CLOSED `<!-- … -->` -- all on its own line.
 *
 * The comment clause is the same kind of exclusion as the backtick one above it and rests
 * on the same settled answer: Obsidian indexes nothing inside a closed HTML comment and
 * keeps the reference LIVE inside an unclosed one, probed against live 1.15.0 --
 * `x <!-- [^1] --> y` reports none, `x <!-- [^1] y` reports it at 0:7. `9298fc7` shipped
 * that rule for the tokenized path; this scan is the untokenized one, so it needed it too.
 *
 * Measured over all 6,844 as a corpus-wide predicate before being written: 2 gain / 0
 * break, against 0.5% for the `%%` form and 12.0% for inline footnotes. It is a PROJECTION
 * fidelity fix rather than a parser fix -- our tree emits no reference at either position,
 * so this scan was inventing one Obsidian does not report.
 */
function isDelimited(slice: string, at: number): boolean {
  if (at > 0 && slice[at - 1] === "\\") return true;
  const lineStart = slice.lastIndexOf("\n", at - 1) + 1;
  let ticks = 0;
  for (let index = lineStart; index < at; index++) {
    if (slice[index] === "`") ticks += 1;
  }
  if (ticks % 2 === 1) return true;

  const lineEnd = slice.indexOf("\n", at);
  const before = slice.slice(lineStart, at);
  const after = slice.slice(at, lineEnd === -1 ? undefined : lineEnd);
  const opener = before.lastIndexOf("<!--");
  return (
    opener !== -1 && !before.includes("-->", opener) && after.includes("-->")
  );
}

export function factsOf(tree: Root, source: string): Facts {
  const defs: Def[] = [];
  const refs: Ref[] = [];
  const defSpans: Span[] = [];
  const refSpans: Span[] = [];
  let unplaced = 0;
  const spanOf = (position: { start: Point; end: Point }): Span => [
    position.start.line - 1,
    position.start.column - 1,
    position.start.offset ?? -1,
    position.end.line - 1,
    position.end.column - 1,
    position.end.offset ?? -1,
  ];
  const spanAt = (from: number, to: number): Span => [
    lineOf(source, from),
    columnOf(source, from),
    from,
    lineOf(source, to),
    columnOf(source, to),
    to,
  ];

  const walk = (node: unknown, inComment: boolean): void => {
    const candidate = node as {
      type?: string;
      identifier?: string;
      position?: { start: Point; end: Point };
      children?: unknown[];
    };
    const at = candidate.position;
    const id = () => String(candidate.identifier);

    if (candidate.type === "footnoteDefinition") {
      if (!inComment) {
        if (!at) unplaced += 1;
        else {
          defs.push([
            id(),
            at.start.line - 1,
            at.start.column - 1,
            at.end.line - 1,
          ]);
          defSpans.push(spanOf(at));
        }
      } else if (at) {
        refs.push([id(), at.start.line - 1, at.start.column - 1]);
        // Indexed as the reference its label is: the `[^name]`, not the whole definition.
        const from = at.start.offset ?? -1;
        const close = from < 0 ? -1 : source.indexOf("]", from);
        refSpans.push(close < 0 ? spanOf(at) : spanAt(from, close + 1));
      }
    } else if (candidate.type === "footnoteReference") {
      if (!at) unplaced += 1;
      else {
        refs.push([id(), at.start.line - 1, at.start.column - 1]);
        refSpans.push(spanOf(at));
      }
    }

    // A BURIED `code` NODE'S CONTENT IS SCANNED, because nothing tokenizes it.
    //
    // Obsidian indexes every `[^name]` inside a comment at its real column, whatever block
    // the line would otherwise form. Measured four ways against live 1.14.4:
    //
    //     %%/⟨2sp⟩+⟨7sp⟩[^3]: It   ref 3@1:10   code inside a list item
    //     %%/⟨4sp⟩[^4]: ...        ref 4@1:4    indented code
    //     %%/[^5]: plain           ref 5@1:0    an actual definition
    //     %%/⟨4sp⟩plain [^6] ...   ref 6@1:10   a REFERENCE inside indented code
    //
    // The last row is why walking for a buried `footnoteDefinition` could never be enough:
    // the rule is not about definitions. Rows one, two and four form a `code` node, whose
    // inline content is never tokenized, so the walk saw nothing -- 237 documents, the
    // largest single shape `shapes.mts` reports.
    //
    // SCOPED TO `code`, not to the whole comment. Scanning the comment's entire slice instead
    // recovers this shape and then over-fires elsewhere, for a net 5439 -> 5400: a comment
    // whose extent is wider than Obsidian's contributes every label inside the surplus, and
    // our extent differing on a comment holding a fence is a known class with its own
    // disagreements. Scanning only `code` touches exactly the nodes the walk cannot see.
    //
    // Read from the SOURCE SLICE rather than the node's value, for the reason
    // `normalize.ts` records: inside a container the value has each line's prefix stripped,
    // so a value index no longer says where the match sits.
    if (inComment && candidate.type === "code" && isIndented(source, at)) {
      const from = at?.start?.offset;
      const to = at?.end?.offset;
      if (from !== undefined && to !== undefined) {
        const slice = source.slice(from, to);
        for (const match of slice.matchAll(LABEL)) {
          // BACKTICKS AND ESCAPES STILL COUNT inside a buried code node. The scan above exists
          // because nothing tokenizes such a node's content, but Obsidian does not index every
          // bracket in it -- measured against live 1.15.0, with the indentation isolated as the
          // only variable:
          //
          //     %% / `More `[^b]` end`              no ref    (unindented, we agreed already)
          //     %% / `⟨4sp⟩More `[^b]` end`         NO REF    we invented one
          //     %% / `⟨4sp⟩plain [^6] more`         ref 6     indexed, per the rows above
          //
          // So the discriminator is the delimiter, not the indentation: a label inside a
          // backtick run or behind a backslash is literal even here. 9 documents, 11
          // assertions, every one organic rather than a probe.
          if (isDelimited(slice, match.index)) continue;
          refs.push([
            // FOLDED, as mdast folds an identifier and as the answers record them. Pushing
            // the raw capture reported `Ä` against the answer's `ä`, for -251 documents.
            match[1]!.toLowerCase(),
            lineOf(source, from + match.index),
            columnOf(source, from + match.index),
          ]);
          refSpans.push(
            spanAt(from + match.index, from + match.index + match[0].length),
          );
        }
      }
      return;
    }

    const buried = inComment || candidate.type === "comment";
    for (const child of candidate.children ?? []) walk(child, buried);
  };

  walk(tree, false);
  return { defs, refs, defSpans, refSpans, unplaced };
}
