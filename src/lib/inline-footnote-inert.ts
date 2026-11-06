import type { Root, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { bareFootnoteRefTransform } from "./footnote-bare.js";
import { footnoteAfterLabelTransform } from "./footnote-after-label.js";

interface ParentNode extends Node {
  children: Node[];
}

/**
 * A footnote reference inside `^[...]` is not a reference.
 *
 * GFM binds `[^1]` to its definition while parsing, wherever it sits, so
 * `^[see [^1]]` arrives holding a live `footnoteReference`. Obsidian does not
 * read it that way: `metadataCache` records no reference for that document,
 * and the inline note renders as a single marker.
 *
 * The node becomes the text it was written as, which loses nothing -- `[^1]`
 * is exactly what the source said. Only footnote constructs are demoted,
 * because that is the whole of what has been measured; whether emphasis
 * inside an inline note is also inert has no case behind it yet.
 */
export function inlineFootnoteInertTransform(tree: Root): void {
  visit(tree, "footnote", (note: Node) => {
    visit(note, "footnoteReference", (node: Node, index, parent) => {
      if (!parent || typeof index !== "number") return;
      const reference = node as unknown as {
        identifier: string;
        label?: string;
      };
      const literal: Text = {
        type: "text",
        value: `[^${reference.label ?? reference.identifier}]`,
        ...(node.position ? { position: node.position } : {}),
      };
      (parent as ParentNode).children.splice(index, 1, literal);
      return index;
    });
  });
}

/**
 * The same references kept as nodes marked `data: { inert: true }`, under `inertFootnoteRefs`.
 *
 * They are every one the same inline footnote would hold if its references were live, defined
 * or not, so a consumer that reserves a name or refuses to nest needs no second scan. Read as the
 * passes above read them for the rest of the document: GFM leaves an undefined one as text, and
 * `[x][^9]` holds none.
 */
export function inlineFootnoteInertKeepTransform(
  tree: Root,
  source: string,
): void {
  visit(tree, "footnote", (note: Node) => {
    bareFootnoteRefTransform(note as Root, source);
    footnoteAfterLabelTransform(note as Root, source);
    visit(note, "footnoteReference", (node: Node) => {
      const reference = node as Node & { data?: Record<string, unknown> };
      reference.data = { ...reference.data, inert: true };
    });
  });
}
