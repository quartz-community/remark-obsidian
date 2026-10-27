import type { FootnoteReference, Root, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import { characterEntitiesLegacy } from "character-entities-legacy";
import { decodeNamedCharacterReference } from "decode-named-character-reference";

/**
 * ASCII whitespace only, written out because `\s` is wider than the rule.
 *
 * A footnote label may not hold a space, a tab or a line ending -- widening it to allow
 * them costs eleven cases, which `hunt/invalid-name-rewritten-by-rules/0-5` was
 * established for. It may hold a no-break space: `[^~~⟨nbsp⟩~~]` is a reference whose
 * label is `~~⟨nbsp⟩~~`, and Obsidian renders that label bare. `\s` matches U+00A0, so
 * the shorthand silently excluded it -- the same trap as `\w` quietly meaning "and
 * underscore", which cost two cases in the block-identifier tail.
 */
const BLANK = " \\t\\r\\n\\v\\f";
const REFERENCE = new RegExp(`\\[\\^([^[\\]${BLANK}]+)\\]`, "g");

interface ParentNode extends Node {
  children: Node[];
}

/**
 * Obsidian consumes a footnote reference's delimiters even when nothing defines it,
 * so `see [^x]` renders as `see x`. GFM instead needs a matching definition and
 * leaves an unmatched reference as literal text, which is where we diverged.
 *
 * A `[^name]` sitting in a text node is one GFM did not resolve — a resolved one is
 * already a `footnoteReference`, and one inside a code span or fence is
 * `inlineCode`/`code`. That used to make a definition lookup unnecessary, but it no
 * longer does: the comment transforms run first and can re-insert a definition that
 * was hidden inside a `%%` comment while GFM was binding references.
 * `%%\nhidden\n%% [^1]: def` followed by `use[^1]` is the case — Obsidian shows a
 * live reference there, so a definition recovered after the fact has to revive its
 * references rather than have them flattened.
 *
 * Both outcomes are a real `footnoteReference`; only the rendering differs. An
 * undefined one used to be reduced here to its bare name, which is what Obsidian
 * *displays* -- but a node value is not a rendering. Flattening `a[^1]` to the
 * text `a1` left the node claiming a span it no longer reproduced, so a formatter
 * serialising this tree wrote the shorter text back and destroyed a reference the
 * author had merely not defined yet. The reference survives as a node, which
 * round-trips to `[^1]`, and consumers render an undefined one as its bare label.
 */
const PUNCTUATION = /[!-/:-@[-`{-~]/u;

/**
 * Which characters of a text node's value came from a backslash escape.
 *
 * By the time a text node exists the backslash is gone, so `literal \[^9]` and
 * `literal [^9]` have identical values — and reducing the first would delete a
 * marker the author escaped on purpose. Walking the source the node came from
 * recovers the distinction.
 *
 * Returns `null` when the walk does not reproduce the value, which happens for
 * character references and anything else that rewrites text. The caller then
 * keeps its old behaviour rather than trusting a bad alignment.
 */
interface SourceAlignment {
  /** Whether value character `i` arrived through a backslash escape. */
  readonly escaped: boolean[];
  /** Source offset of value character `i`, with a final entry for the end. */
  readonly at: number[];
}

/** The longest name HTML resolves without a semicolon, bounding the scan. */
const LEGACY = new Set<string>(characterEntitiesLegacy);
const MAX_NAME = Math.max(...[...LEGACY].map((name) => name.length));

/**
 * The character reference beginning at `index`, if there is one.
 *
 * The aligner has to resolve these because the value it is matching against has
 * already resolved them: `[^&amp;]` reaches a text node as `[^&]`, so modelling only
 * escapes left the two strings different lengths, the alignment returned `null`, and
 * every node spliced out of that text lost its position. Eight bare references and
 * part of the surrounding text, across this corpus.
 *
 * The same rule the parser applies in `legacy-entity.ts` -- a semicolon is optional for
 * HTML's legacy names, which match greedily, and for numeric references.
 */
function referenceAt(
  source: string,
  index: number,
): { text: string; length: number } | undefined {
  const rest = source.slice(index + 1, index + 2 + MAX_NAME);
  const numeric = /^#([Xx])?([\dA-Fa-f]+)(;?)/u.exec(rest);
  if (numeric) {
    const hex = numeric[1] !== undefined;
    const digits = numeric[2]!;
    if (!hex && !/^\d+$/u.test(digits)) return undefined;
    const code = Number.parseInt(digits, hex ? 16 : 10);
    const text =
      code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
        ? "\uFFFD"
        : String.fromCodePoint(code);
    return { text, length: 1 + numeric[0].length };
  }

  const named = /^([A-Za-z][\dA-Za-z]*)(;?)/u.exec(rest);
  if (!named) return undefined;
  const name = named[1]!;
  if (named[2] === ";") {
    const full = decodeNamedCharacterReference(name);
    return full === false ? undefined : { text: full, length: name.length + 2 };
  }
  for (let length = Math.min(name.length, MAX_NAME); length > 0; length--) {
    const candidate = name.slice(0, length);
    if (!LEGACY.has(candidate)) continue;
    const decoded = decodeNamedCharacterReference(candidate);
    if (decoded !== false) return { text: decoded, length: length + 1 };
  }
  return undefined;
}

/**
 * Align a node's value to its source, tolerating a container's continuation indent.
 *
 * The strict pass is tried first and is unchanged: it rebuilds the value from the
 * source, resolving escapes and character references, and returns null unless the two
 * agree exactly. That exactness is the point -- `at[]` drives every spliced node's
 * position, and a wrong offset is worse than a missing one.
 *
 * A paragraph inside a container defeats it, though, and not for any interesting
 * reason: the source carries the continuation indent and the value does not, so the
 * rebuild is longer than the value and the whole alignment is dropped. The label then
 * comes from the value, where micromark has already resolved the escape, and
 * `[^1\]` stops naming `1\`.
 *
 * So the strict pass is followed by one that skips whitespace after a line ending.
 * `at[]` still records the real offset of every character it keeps, which is what
 * keeps the spliced positions exact -- the indent is absent from the value, so no
 * value index ever maps into it.
 *
 * Skipping a *leading* run as well is REFUTED, and the parity corpus cannot see it.
 * A container's first content line starts its paragraph mid-prefix -- `> [!tip]` over
 * `>     [^a]: def` begins it at the second of five spaces -- so this run never finds a
 * `\n` to hang the skip on and leaves 451 references across 280 referee documents with
 * no position. Skipping from offset zero instead measures 0 parity gains and 0 parity
 * regressions, which reads like a free fix, while the referee drops 4604 -> 4561
 * documents and the unplaced count RISES 451 -> 504: leading whitespace is genuine
 * content often enough that the rebuild then mismatches and the retry fails where it
 * used to succeed.
 *
 * Guarding that skip on the value -- taking it only when the value does NOT itself begin
 * with whitespace, so the value proves the run is indent rather than content -- is the
 * obvious refinement and is ALSO refuted. It places 28 more references (unplaced
 * 451 -> 423) and still costs 14 documents of agreement (4828 -> 4814), because some of
 * those 28 get an offset Obsidian disagrees with.
 *
 * And the reason the count is a bad target at all is worth keeping: the referee EXCLUDES
 * an unplaced node from its set comparison, so leaving a reference unplaced quietly
 * produces the right answer whenever Obsidian does not index it either. Driving
 * `unplaced` down therefore moves agreement in either direction, and agreement is the
 * metric. Anything here needs to establish WHICH references Obsidian indexes first --
 * a placement rule alone cannot do it.
 */
function alignToSource(source: string, value: string): SourceAlignment | null {
  const strict = alignRun(source, value, "strict");
  if (strict) return strict;
  const indent = alignRun(source, value, "indent");
  if (indent) return indent;
  // A quote strips `> ` from every continuation line, so a multi-line paragraph inside
  // one has a value its own source slice cannot reproduce by skipping whitespace alone:
  // `> q` / `>   near [^b]` gives the slice `q\n>   near [^b]` against the value
  // `q\nnear [^b]`. Both earlier modes fail, every spliced node loses its position, and
  // the referee corpus holds 451 of them -- all `footnoteReference`, 432 inside a
  // paragraph.
  //
  // Third rather than widening `indent`: a mode only runs when the ones before it fail,
  // so an alignment that already succeeds cannot be changed by this. That matters because
  // two earlier widenings of the indent skip are refuted below with their numbers.
  const quote = alignRun(source, value, "quote");
  if (quote) return quote;
  // Fourth, for a node whose span STARTS AT THE LINE ENDING BEFORE ITS CONTENT. A callout
  // with an empty title leaves the body's start just past the consumed title, which on the
  // next line is the `\n` and the container prefix rather than the value's first character:
  //
  //     `> [!note] ` / `> ab[^1]`   paragraph and text both start at offset 10, the `\n`,
  //                                 while the value `ab[^1]` begins at offset 13
  //
  // `quote` cannot reach it -- it skips a marker run only AFTER a line ending it has already
  // emitted into `rebuilt`, and this value holds no line ending for that skip to follow.
  return alignRun(source, value, "lead");
}

function alignRun(
  source: string,
  value: string,
  mode: "strict" | "indent" | "quote" | "lead",
): SourceAlignment | null {
  const skipIndent = mode !== "strict";
  const escaped: boolean[] = [];
  const at: number[] = [];
  const rebuilt: string[] = [];

  let begin = 0;
  if (mode === "lead") {
    const leading = LEADING_BREAK.exec(source);
    if (!leading) return null;
    begin = leading[0].length;
  }

  for (let index = begin; index < source.length; index++) {
    const character = source[index]!;
    const next = source[index + 1];
    at.push(index);
    if (character === "\\" && next !== undefined && PUNCTUATION.test(next)) {
      escaped.push(true);
      rebuilt.push(next);
      index++;
      continue;
    }
    if (skipIndent && character === "\n") {
      escaped.push(false);
      rebuilt.push("\n");
      let ahead = index + 1;
      const blank = () =>
        ahead < source.length &&
        (source[ahead] === " " || source[ahead] === "\t");
      while (blank()) ahead += 1;
      if (mode === "quote") {
        // A run of quote markers, each able to carry its own indent on either side.
        while (ahead < source.length && source[ahead] === ">") {
          ahead += 1;
          while (blank()) ahead += 1;
        }
      }
      index = ahead - 1;
      continue;
    }
    if (character === "&") {
      const reference = referenceAt(source, index);
      if (reference) {
        // Every character the reference decodes to maps back to where it started.
        at.pop();
        for (const decoded of reference.text) {
          at.push(index);
          escaped.push(false);
          rebuilt.push(decoded);
        }
        index += reference.length - 1;
        continue;
      }
    }
    escaped.push(false);
    rebuilt.push(character);
  }
  at.push(source.length);

  return rebuilt.join("") === value ? { escaped, at } : null;
}

/**
 * A line ending, with any container prefix on the line it opens, at the START of a slice.
 * This is what a node's span covers when its start was advanced past a consumed title but
 * its content sits on the following line.
 */
const LEADING_BREAK = /^[ \t]*\n(?:[ \t]*>)*[ \t]*/u;

/** A `[^label` left hanging at the end of a text node, with no closer in it. */
const HANGING_OPENER = new RegExp(`\\[\\^[^[\\]${BLANK}]*$`, "u");
/** The label rule, applied to what the source holds between the delimiters. */
const LABEL = new RegExp(`^[^[\\]${BLANK}]+$`, "u");

/**
 * Rejoin a reference whose delimiters an inline construct split apart.
 *
 * Obsidian parses nothing inside a footnote reference's label, so `[^%%note%%]` is a
 * reference to the label `%%note%%` and renders as that text. We let the label's
 * contents tokenise, and whatever forms there takes the `]` out of reach of the pass
 * above -- which only ever sees one text node:
 *
 *     [^%%note%%]      text "[^" + comment + text "]"      no reference at all
 *     [^==mark==]      text "[^" + highlight + text "]"
 *     [^<br>]          text "[^" + html + text "]"
 *     [^_under_]       text "[^" + emphasis + text "]"
 *
 * Deliberately narrow, because 699 cases in this corpus hold a `[^`. It fires only
 * where a run is *currently* split, which is exactly where no reference exists now:
 * a reference GFM resolved is already a node, and one the pass above handled never
 * had its closer taken away.
 *
 * Both delimiter offsets are computed from the text nodes and then checked against
 * the source before anything is replaced, so an escape or a character reference in
 * the surrounding text makes this stand aside rather than guess.
 */
function rejoinSplitReferences(tree: Root, source: string): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    const children = parent.children;
    if (!Array.isArray(children)) return;

    for (let index = 0; index < children.length; index++) {
      const opener = children[index];
      if (opener?.type !== "text") continue;
      const value = (opener as Text).value;
      const hanging = HANGING_OPENER.exec(value);
      if (!hanging) continue;
      const openerEnd = (opener as Text).position?.end?.offset;
      if (openerEnd === undefined) continue;
      const markerAt = openerEnd - hanging[0].length;
      if (source.slice(markerAt, markerAt + 2) !== "[^") continue;

      // The closer is the next text sibling holding a `]`; the constructs between
      // are what took it out of reach.
      let closerIndex = -1;
      let closerAt = -1;
      for (let scan = index + 1; scan < children.length; scan++) {
        const candidate = children[scan];
        if (candidate?.type !== "text") continue;
        const bracket = (candidate as Text).value.indexOf("]");
        if (bracket === -1) continue;
        const start = (candidate as Text).position?.start?.offset;
        if (start === undefined) break;
        if (source[start + bracket] !== "]") break;
        closerIndex = scan;
        closerAt = start + bracket;
        break;
      }
      if (closerIndex === -1) continue;

      const written = source.slice(markerAt + 2, closerAt);
      if (!LABEL.test(written)) continue;

      const before = value.slice(0, value.length - hanging[0].length);
      const closer = children[closerIndex] as Text;
      const after = closer.value.slice(closer.value.indexOf("]") + 1);

      const reference = {
        type: "footnoteReference",
        identifier: written.toLowerCase(),
        label: written,
        position: {
          start: { line: 0, column: 0, offset: markerAt },
          end: { line: 0, column: 0, offset: closerAt + 1 },
        },
      } as unknown as Node;

      const replacement: Node[] = [];
      if (before !== "") {
        replacement.push({
          type: "text",
          value: before,
          position: {
            start: { ...(opener as Text).position!.start },
            end: { line: 0, column: 0, offset: markerAt },
          },
        } as unknown as Node);
      }
      replacement.push(reference);
      if (after !== "") {
        replacement.push({
          type: "text",
          value: after,
          position: {
            start: { line: 0, column: 0, offset: closerAt + 1 },
            end: { ...closer.position!.end },
          },
        } as unknown as Node);
      }

      children.splice(index, closerIndex - index + 1, ...replacement);
      index += replacement.length - 1;
    }
  });
}

/** A node's end offset, if it has one. */
function endOf(node: Node | undefined): number | undefined {
  return (node as { position?: { end?: { offset?: number } } } | undefined)
    ?.position?.end?.offset;
}

/** Where a balanced bracket scan from `open` closes, or -1. */
function balancedClose(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    const character = source[index];
    if (character === "\\") {
      index++;
      continue;
    }
    if (character === "\n") return -1;
    if (character === "[") depth++;
    else if (character === "]") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * A footnote label holding a bracket, which runs to the **first** `]`.
 *
 * Obsidian's footnote label is not balance-scanned the way its link label is:
 * `[^a[b]c]` renders `a[bc]`, which is the label `a[b` with `c]` left as text, and
 * nothing parses inside it. We let the label's contents tokenise, so `[^[[a]]]`
 * became a wikilink to `a` where Obsidian reports the text `[[a]]` and no link.
 *
 * Only a label that actually holds a `[`. Every other form is already handled --
 * by GFM when a definition matches, or by the passes above when it does not -- and
 * claiming them would re-decide 1517 corpus cases for nothing.
 *
 * Declines when an outer link forms, which is the one thing that outranks this
 * reading: `[^[note]](url)` is a *link* whose label holds an inline footnote, so a
 * balanced close followed by a destination means this is not a footnote at all.
 */
function bracketLabelReferences(tree: Root, source: string): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    const children = parent.children;
    if (!Array.isArray(children)) return;

    for (let index = 0; index < children.length; index++) {
      const opener = children[index];
      if (opener?.type !== "text") continue;
      const value = (opener as Text).value;
      const openerStart = (opener as Text).position?.start?.offset;
      const openerEnd = endOf(opener);
      if (openerStart === undefined || openerEnd === undefined) continue;

      // Two ways the marker shows up. Usually both characters sit in this text
      // node. But our inline-footnote construct claims the `^[` first, which leaves
      // the text node ending at the bracket and the rest inside a `footnote` -- so
      // `[^[[a]]]` arrives as text `[`, a footnote, then text `]`, with no `[^`
      // anywhere to search for.
      //
      // That shape is also what tells this apart from `[^[note]](url)`, where the
      // footnote is inside a *link* rather than beside a text node: there the outer
      // pair really is a link label and Obsidian agrees.
      let at = value.lastIndexOf("[^");
      if (at === -1) {
        if (!value.endsWith("[")) continue;
        if (children[index + 1]?.type !== "footnote") continue;
        at = value.length - 1;
      }
      // Through the alignment, not by adding the index. A value and its source run
      // to different lengths wherever an escape or a character reference sits
      // between them, and `> > &amp;⇥[^[^1]]^` is exactly that -- `&amp;` decodes to
      // one character, so counting from the node's start landed four bytes early
      // and the `[^` guard below declined a case that should be claimed.
      const slice = source.slice(openerStart, openerEnd);
      const aligned = alignToSource(slice, value);
      const markerAt =
        aligned === null
          ? openerStart + at
          : openerStart + (aligned.at[at] ?? at);
      if (source.slice(markerAt, markerAt + 2) !== "[^") continue;

      const close = source.indexOf("]", markerAt + 2);
      if (close === -1) continue;
      const label = source.slice(markerAt + 2, close);
      if (!label.includes("[")) continue;
      if (label.includes("\n") || /^\s*$/u.test(label)) continue;
      // A name may not hold ASCII whitespace: `a[^x [y] b` is no reference in
      // Obsidian, where we claimed one named `x [y`. The test has to be ASCII
      // rather than `\s`, because the referee's answers hold six names carrying
      // U+00A0 or U+3000 that Obsidian DOES accept -- `\s` covers U+00A0 and
      // would reject them. The sibling project states this as E5b.
      if (/[ \t\v\f]/u.test(label)) continue;

      const outer = balancedClose(source, markerAt);
      if (outer !== -1) {
        const next = source[outer + 1];
        if (next === "(" || next === "[") continue;
      }

      // Everything from the marker to that `]` belongs to the reference, so every
      // sibling it covers goes with it.
      let last = index;
      while (last < children.length) {
        const end = endOf(children[last]);
        if (end === undefined) return;
        if (end >= close + 1) break;
        last++;
      }
      if (last >= children.length) continue;
      const tailEnd = endOf(children[last]);
      if (tailEnd === undefined) continue;

      const before = value.slice(0, at);
      const replacement: Node[] = [];
      if (before !== "") {
        replacement.push({
          type: "text",
          value: before,
          position: {
            start: { ...(opener as Text).position!.start },
            end: { line: 0, column: 1, offset: markerAt },
          },
        } as unknown as Node);
      }
      replacement.push({
        type: "footnoteReference",
        identifier: label.toLowerCase(),
        label,
        position: {
          start: { line: 0, column: 1, offset: markerAt },
          end: { line: 0, column: 1, offset: close + 1 },
        },
      } as unknown as Node);
      if (tailEnd > close + 1) {
        replacement.push({
          type: "text",
          value: source.slice(close + 1, tailEnd),
          position: {
            start: { line: 0, column: 1, offset: close + 1 },
            end: { line: 0, column: 1, offset: tailEnd },
          },
        } as unknown as Node);
      }

      children.splice(index, last - index + 1, ...replacement);
      index += replacement.length - 1;
    }
  });
}

function inClosedComment(source: string, offset: number | undefined): boolean {
  if (offset === undefined) return false;

  const from = source.lastIndexOf("\n", offset - 1) + 1;
  const to = source.indexOf("\n", offset);
  const line = source.slice(from, to === -1 ? undefined : to);
  const column = offset - from;

  for (let at = line.indexOf("<!--"); at !== -1;) {
    const close = line.indexOf("-->", at + 4);
    if (close === -1) return false;
    if (column > at && column < close + 3) return true;
    at = line.indexOf("<!--", close + 3);
  }
  return false;
}

function insideAutolink(parent: unknown, source: string): boolean {
  const node = parent as
    | { type?: string; position?: { start?: { offset?: number } } }
    | null
    | undefined;
  if (node?.type !== "link") return false;

  const at = node.position?.start?.offset;
  return at !== undefined && source[at] === "<";
}

export function bareFootnoteRefTransform(
  tree: Root,
  source = "",
  options: {
    /**
     * Convert only references to these identifiers, as GFM would have: `strict`'s use, where a
     * reference nothing defines stays literal, but a definition that a pass built from a
     * re-parsed fragment -- a callout's title line, a comment's tail -- still has to be found.
     * micromark resolved every reference before those definitions existed.
     */
    readonly defined?: ReadonlySet<string>;
  } = {},
): void {
  const only = options.defined;
  if (source !== "" && only === undefined) {
    bracketLabelReferences(tree, source);
    rejoinSplitReferences(tree, source);
  }

  visit(tree, "text", (node: Node, index, parent) => {
    const text = node as Text;
    if (!text.value.includes("[^")) return;
    // Measured: a reference inside an AUTOLINK is never indexed (5 of 5), while
    // one inside an ordinary link's text is (33 of 38). Widening this to every
    // `link` scores 13%.
    if (insideAutolink(parent, source)) return;

    const from = text.position?.start?.offset;
    const to = text.position?.end?.offset;
    const startPoint = text.position?.start;
    const slice =
      source && from !== undefined && to !== undefined
        ? source.slice(from, to)
        : "";
    const aligned = slice ? alignToSource(slice, text.value) : null;

    /**
     * Where a value index sits in the document.
     *
     * A spliced node has to carry a position: without one a formatter cannot
     * place its edit, and the metadata oracle comparing a reference's line and
     * column against Obsidian's own answer has nothing to compare. `at[]` maps
     * a value index to its source offset, so the span is exact rather than
     * estimated -- including inside a folded paragraph, where one text node
     * spans several lines.
     */
    const pointAt =
      aligned && from !== undefined && startPoint
        ? (valueIndex: number) => {
            const sliceIndex = aligned.at[valueIndex] ?? slice.length;
            const before = slice.slice(0, sliceIndex);
            const lastBreak = before.lastIndexOf("\n");
            const newlines = before.split("\n").length - 1;
            return {
              line: startPoint.line + newlines,
              // After a line break the next character is column 1, so the
              // distance from the break is the column; on the node's own first
              // line the column continues from where the node started.
              column:
                newlines === 0
                  ? startPoint.column + sliceIndex
                  : sliceIndex - lastBreak,
              offset: from + sliceIndex,
            };
          }
        : null;

    const positioned = <T extends Node>(
      candidate: T,
      valueFrom: number,
      valueTo: number,
    ): T => {
      if (pointAt) {
        candidate.position = {
          start: pointAt(valueFrom),
          end: pointAt(valueTo),
        };
      }
      return candidate;
    };

    const parts: Node[] = [];
    let cursor = 0;
    REFERENCE.lastIndex = 0;

    const pushText = (valueFrom: number, valueTo: number): void => {
      if (valueTo <= valueFrom) return;
      const value = text.value.slice(valueFrom, valueTo);
      const previous = parts[parts.length - 1];
      if (previous && previous.type === "text") {
        (previous as Text).value += value;
        // Merged text keeps the earlier start and takes the later end, so the
        // joined node still reproduces its own source slice.
        if (pointAt && previous.position) {
          previous.position.end = pointAt(valueTo);
        }
        return;
      }
      parts.push(
        positioned({ type: "text", value } as Text, valueFrom, valueTo),
      );
    };

    for (
      let match = REFERENCE.exec(text.value);
      match !== null;
      match = REFERENCE.exec(text.value)
    ) {
      const name = match[1]!;
      // An escaped `\[` is a literal bracket, so this is not a reference at
      // all and must survive as written.
      if (aligned?.escaped[match.index]) continue;
      // Measured: Obsidian indexes nothing inside a CLOSED `<!-- … -->`, and keeps
      // the reference live inside an unclosed one -- `x <!-- [^1] y` reports it at
      // 0:7. The inline `html` node normally keeps this text away from the scan;
      // where a reparse has flattened it back, this is the guard.
      if (inClosedComment(source, pointAt?.(match.index)?.offset)) continue;
      // mdast lowercases a footnote identifier, and Obsidian shows that rather
      // than the label as written: `[^Cell]` reads `cell`.
      // Read the label from the source, not the value: Obsidian does not apply
      // escapes while scanning one, so `[^a\]` names `a\` and keeps the
      // backslash the value had already dropped.
      const written = aligned
        ? slice
            .slice(
              aligned.at[match.index]! + 2,
              aligned.at[match.index + match[0].length]! - 1,
            )
            .replace(/\\(?=[!-/:-@[-`{-~])/gu, "\\")
        : name;
      const identifier = written.toLowerCase();
      if (only !== undefined && !only.has(identifier)) continue;
      pushText(cursor, match.index);
      parts.push(
        positioned(
          {
            type: "footnoteReference",
            identifier,
            label: written,
          } as unknown as FootnoteReference,
          match.index,
          match.index + match[0].length,
        ),
      );
      cursor = match.index + match[0].length;
    }

    if (parts.length === 0) return;
    pushText(cursor, text.value.length);
    if (!parent || typeof index !== "number") return;

    (parent as ParentNode).children.splice(index, 1, ...parts);
    return index + parts.length;
  });
}
