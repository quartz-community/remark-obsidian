import type { FootnoteReference, Root, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

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
    escaped.push(false);
    rebuilt.push(character);
  }
  at.push(source.length);

  return rebuilt.join("") === value ? { escaped, at } : null;
}

export function bareFootnoteRefTransform(tree: Root, source = ""): void {
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
