import { decodeString } from "micromark-util-decode-string";
import type { Link, Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface ParentNode extends Node {
  children: RootContent[];
}

/** ASCII whitespace, which is where a bare URL ends. */
const BLANK = new Set([" ", "\t", "\r", "\n", "\v", "\f"]);

/** A link written as nothing but its own destination. */
function isLiteral(node: RootContent): node is Link {
  if (node.type !== "link" || node.title) return false;
  if (node.children.length !== 1) return false;
  const only = node.children[0];
  if (only?.type !== "text") return false;
  return node.url === only.value || node.url === `mailto:${only.value}`;
}

/**
 * A bare URL runs to whitespace, and nothing inside it parses.
 *
 * GFM stops an autolink literal at `](` -- its trail check reads the `]` as trailing
 * punctuation when a `(` follows -- and then lets the remainder tokenise. Obsidian does
 * not stop there, so everything to the next space belongs to the link and no construct
 * forms inside it:
 *
 *     https://e.test/p](`code`         one link; the backticks are literal
 *     https://e.test/p]([[[[&amp;]]]]  one link; no wikilink, and `&amp;` decodes
 *     https://e.test/p]($y^2$]([[#tag]] a#h]]
 *                                      link to the space, then ` a#h]]` as text
 *
 * The trim set and the whitespace boundary were both probed and already agree -- all
 * eighteen `probe/autolink-trail/*` cases match, including the backtick, dollar and
 * wikilink shapes -- so `](` is the entire remaining difference and this fires only
 * there. That keeps it off the 33 bare-URL cases that already match, and off the
 * `<...>` autolinks in `commonmark/links/526` and its siblings, which are a different
 * construct.
 *
 * Repaired on the tree rather than by replacing GFM's construct. The rule itself is
 * one decision, and the alternative is a full bare-URL tokenizer competing with an
 * extension whose trailing-punctuation and paren-balancing rules the probes show we
 * already reproduce.
 */
export function autolinkLiteralExtentTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;
    const kids: RootContent[] = parent.children;

    for (let index = kids.length - 2; index >= 0; index--) {
      const link = kids[index]!;
      if (!isLiteral(link)) continue;

      const from = link.position?.start?.offset;
      const stop = link.position?.end?.offset;
      if (from === undefined || stop === undefined) continue;
      // A *literal* only. `<mailto:a@e.test>](<br>` is an angle autolink, and
      // Obsidian ends it at the `>` exactly as CommonMark does -- it renders
      // `a@e.test](` with the `<br>` as an element. `isLiteral` cannot tell the two
      // apart, because an angle autolink's text is also just its destination, so the
      // source decides. `fuzz/embed/125` is what measures it.
      if (source[from] === "<") continue;
      if (source.slice(stop, stop + 2) !== "](") continue;

      // To the next ASCII whitespace, or the end of whatever holds the link.
      const limit = (
        node as Partial<ParentNode> & {
          position?: { end?: { offset?: number } };
        }
      ).position?.end?.offset;
      let end = stop;
      while (
        end < (limit ?? source.length) &&
        !BLANK.has(source[end] ?? "\n")
      ) {
        end += 1;
      }
      if (end === stop) continue;

      // Everything the extended link now covers is consumed. The last of those may
      // run past the boundary -- `]( end` is one text node -- so its tail is kept
      // rather than swallowed, which is also what leaves ` a#h]]` behind.
      let last = index;
      let tailFrom = end;
      let tailTo = end;
      while (last + 1 < kids.length) {
        const next = kids[last + 1]!;
        const at = next.position?.start?.offset;
        if (at === undefined || at >= end) break;
        last += 1;
        tailTo = Math.max(tailTo, next.position?.end?.offset ?? end);
      }

      const written = decodeString(source.slice(from, end));
      const text: Text = {
        type: "text",
        value: written,
        position: {
          start: { ...link.position!.start },
          end: { line: 0, column: 0, offset: end },
        },
      };
      link.url = written;
      link.children = [text];
      if (link.position) {
        link.position.end = { line: 0, column: 0, offset: end };
      }

      const replacement: RootContent[] = [];
      if (tailTo > tailFrom) {
        replacement.push({
          type: "text",
          value: decodeString(source.slice(tailFrom, tailTo)),
          position: {
            start: { line: 0, column: 0, offset: tailFrom },
            end: { line: 0, column: 0, offset: tailTo },
          },
        } as Text);
      }
      kids.splice(index + 1, last - index, ...replacement);
    }
  });
}
