import type { Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { pointAt } from "./normalize-points.js";

/** What a node was written as, for the nodes that can arrive without a position. */
function written(node: RootContent): string | undefined {
  if (node.type === "text") return node.value;
  // An autolink literal's text is its destination, verbatim from the source.
  if (node.type === "link" && node.children.length === 1) {
    const only = node.children[0];
    return only?.type === "text" ? only.value : undefined;
  }
  return undefined;
}

/**
 * Where `text` is written in `source`, from `cursor` on, as `[start, end)`.
 *
 * A text spanning lines has lost each continuation line's indentation and quote prefix, which
 * the source still holds, so a line ending matches those too, and an escape's backslash is
 * optional before any ASCII punctuation. Without that, `x` / `····[^https://e.test/p]`
 * stayed unplaced and its reference was never rejoined, though the same label on one line was
 * (found by `fuzz/invariant-sweep.ts`).
 */
function locate(
  source: string,
  text: string,
  cursor: number,
  tolerant: boolean,
): [number, number] | undefined {
  const at = source.indexOf(text, cursor);
  if (at !== -1) return [at, at + text.length];
  // Not an autolink literal's text: it is decoded (`<foo\+@bar.example.com>`), and placing it
  // moved a spec example away from stock, which leaves it unplaced.
  if (!tolerant) return undefined;
  // ASCII punctuation may have been escaped in the source: `!\[\[i` holds the text `![[i`.
  const pattern = new RegExp(
    text
      .split("\n")
      .map((line) =>
        [...line]
          .map((character) =>
            /[!-/:-@[-`{-~]/u.test(character)
              ? `\\\\?${character.replace(/[.*+?^${}()|[\]\\]/u, "\\$&")}`
              : character,
          )
          .join(""),
      )
      .join("\\n[ \\t]*(?:>[ \\t]?)*"),
    "gu",
  );
  pattern.lastIndex = cursor;
  const match = pattern.exec(source);
  return match ? [match.index, match.index + match[0].length] : undefined;
}

/**
 * Give a position back to the nodes `mdast-util-find-and-replace` splices without one.
 *
 * `mdast-util-gfm-autolink-literal` builds a `https://` link through
 * `mdast-util-find-and-replace`, which replaces a text node with a run of new nodes and
 * leaves **every one of them with no position**. So `[^https://e.test/p]` reaches the
 * tree as a position-less text, link and text -- and any pass that needs offsets stands
 * aside rather than guess, which is right but leaves the case unreachable.
 *
 * `rejoinSplitReferences` is the one that cares: it rejoins a reference whose label
 * tokenised and took the `]` out of reach, and it works for `[^<br>]`, `[^==mark==]`,
 * `[^_under_]` and `[^e.test/p]` -- every shape whose nodes come from the micromark
 * extension and keep their positions. Restoring the positions here fixes the cause
 * rather than teaching that pass to work without them.
 *
 * The walk tiles the parent's span with what each child was written as, which is exact
 * for this family: a text node's value and an autolink literal's text are both verbatim
 * source. Anything else -- a node type with no written form, or a form the source does
 * not hold at the cursor -- abandons the parent untouched, so a wrong offset is never
 * invented. That is the same standard the passes downstream are applying when they
 * decline.
 */
export function restoreInlinePositionsTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;
    if (parent.children.every((child) => child.position !== undefined)) return;

    const from = (node as Node).position?.start?.offset;
    const to = (node as Node).position?.end?.offset;
    if (from === undefined || to === undefined) return;

    const spans: Array<[number, number]> = [];
    let cursor = from;
    for (const child of parent.children) {
      if (child.position !== undefined) {
        const at = child.position.start?.offset;
        const end = child.position.end?.offset;
        if (at === undefined || end === undefined) return;
        spans.push([at, end]);
        cursor = end;
        continue;
      }
      const text = written(child);
      if (text === undefined || text === "") return;
      const found = locate(source, text, cursor, child.type === "text");
      if (found === undefined || found[1] > to) return;
      spans.push(found);
      cursor = found[1];
    }

    parent.children.forEach((child, index) => {
      if (child.position !== undefined) return;
      const span = spans[index];
      if (span === undefined) return;
      child.position = {
        start: pointAt(source, span[0]),
        end: pointAt(source, span[1]),
      };
      // An autolink literal's single text child spans exactly the same run.
      if (child.type === "link" && child.children.length === 1) {
        const only = child.children[0];
        if (only !== undefined && only.position === undefined) {
          only.position = {
            start: pointAt(source, span[0]),
            end: pointAt(source, span[1]),
          };
        }
      }
    });
  });
}
