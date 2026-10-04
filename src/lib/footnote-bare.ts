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
 * Each match is therefore routed on whether the tree defines it: defined becomes a
 * real `footnoteReference`, undefined is reduced to its bare name as before.
 */
export function bareFootnoteRefTransform(tree: Root): void {
  const defined = new Set<string>();
  visit(tree, "footnoteDefinition", (node: Node) => {
    defined.add(String((node as unknown as { identifier: string }).identifier));
  });

  visit(tree, "text", (node: Node, index, parent) => {
    const text = node as Text;
    if (!text.value.includes("[^")) return;

    const parts: Node[] = [];
    let cursor = 0;
    let revived = false;
    REFERENCE.lastIndex = 0;

    const pushText = (value: string): void => {
      if (value === "") return;
      const previous = parts[parts.length - 1];
      if (previous && previous.type === "text") {
        (previous as Text).value += value;
        return;
      }
      parts.push({ type: "text", value } as Text);
    };

    for (
      let match = REFERENCE.exec(text.value);
      match !== null;
      match = REFERENCE.exec(text.value)
    ) {
      const name = match[1]!;
      // mdast lowercases a footnote identifier, and Obsidian shows that rather
      // than the label as written: `[^Cell]` reads `cell`.
      const identifier = name.toLowerCase();
      pushText(text.value.slice(cursor, match.index));
      if (defined.has(identifier)) {
        parts.push({
          type: "footnoteReference",
          identifier,
          label: name,
        } as unknown as FootnoteReference);
        revived = true;
      } else {
        pushText(identifier);
      }
      cursor = match.index + match[0].length;
    }

    if (parts.length === 0) return;
    pushText(text.value.slice(cursor));

    if (!revived) {
      text.value = parts.map((part) => (part as Text).value).join("");
      return;
    }
    if (!parent || typeof index !== "number") return;

    (parent as ParentNode).children.splice(index, 1, ...parts);
    return index + parts.length;
  });
}
