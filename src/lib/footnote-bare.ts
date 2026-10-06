import type { FootnoteReference, Root, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import { characterEntitiesLegacy } from "character-entities-legacy";
import { decodeNamedCharacterReference } from "decode-named-character-reference";

const REFERENCE = /\[\^([^[\]\s]+)\]/g;

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

function alignToSource(source: string, value: string): SourceAlignment | null {
  const escaped: boolean[] = [];
  const at: number[] = [];
  const rebuilt: string[] = [];

  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    const next = source[index + 1];
    at.push(index);
    if (character === "\\" && next !== undefined && PUNCTUATION.test(next)) {
      escaped.push(true);
      rebuilt.push(next);
      index++;
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

/** A `[^label` left hanging at the end of a text node, with no closer in it. */
const HANGING_OPENER = /\[\^[^[\]\s]*$/u;
/** The label rule, applied to what the source holds between the delimiters. */
const LABEL = /^[^[\]\s]+$/u;

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

export function bareFootnoteRefTransform(tree: Root, source = ""): void {
  if (source !== "") rejoinSplitReferences(tree, source);

  visit(tree, "text", (node: Node, index, parent) => {
    const text = node as Text;
    if (!text.value.includes("[^")) return;

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
