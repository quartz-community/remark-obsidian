import type { Root } from "mdast";
import { visit } from "unist-util-visit";

/**
 * Name every footnote by its label lowercased, as Obsidian does, never case-folded.
 *
 * `mdast-util-gfm-footnote` builds an identifier the CommonMark way: whitespace collapsed, then
 * `toLowerCase().toUpperCase()` and lowercased again -- full Unicode case folding. Obsidian only
 * lowercases: `[^aᾭb]` is the footnote `aᾥb` to its cache where folding gave
 * `aὥιb`, and `[^ßb]` does not reach a `[^SSB]` definition (found by
 * `fuzz/charclass-sweep.ts`). Which label is a reference at all is decided in the syntax
 * (`syntax/footnote.ts`); this keeps the names it produces the same.
 */
export function footnoteIdentifierTransform(tree: Root): void {
  visit(tree, (node) => {
    if (
      node.type !== "footnoteReference" &&
      node.type !== "footnoteDefinition"
    ) {
      return;
    }
    if (typeof node.label === "string")
      node.identifier = node.label.toLowerCase();
  });
}
