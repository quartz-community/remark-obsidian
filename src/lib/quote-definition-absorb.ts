import type { Blockquote, Root, RootContent } from "mdast";
import { visit } from "unist-util-visit";

const QUOTE = /^[ \t]*>/u;
const ADJACENT = /^\n[ \t>]*$/u;
const FENCE = /^ {0,3}(?:> ?)? {0,3}(?:```|~~~)/u;

/**
 * A definition inside a quote absorbs the quoted line below it.
 *
 * `> Q1` / `>` / `[^1]: def` / `> Q2` puts the definition inside the blockquote --
 * the `>`-only line ends the quote's paragraph but not the quote -- and Obsidian
 * reads the line below as the definition's own content, ending it at line 3 where
 * we ended it at line 2. Our tree already nests the definition correctly; only its
 * END was short, and the line below sat as an adjacent sibling.
 *
 * Settled against the live oracle one variable at a time, which is what fixes the
 * terminators rather than guessing them:
 *
 *     > Q1 / > / [^1]: def / > Q2              2->3   absorbs
 *     > Q1 / > / [^1]: def / > Q2 / > Q3       2->4   absorbs BOTH
 *     > Q1 / > / [^1]: def / > Q2 / bare       2->4   absorbs the lazy line too
 *     > Q1 / > / [^1]: def / blank / > Q2      2->2   a blank STOPS it
 *     > Q1 / > / [^1]: def / > Q2 / > / > Q3   2->3   a `>`-only line stops it
 *     > Q1 / > / [^1]: def / > > Q2            2->2   a DEEPER quote does not
 *     [^1]: def / > Q2                          0->0   needs the quote above
 *     para / blank / [^1]: def / > Q2           2->2   a paragraph above is not enough
 *
 * Every one of those terminators falls out of the tree rather than needing its own
 * test: a blank or a `>`-only line leaves a line gap, a deeper quote arrives as a
 * `blockquote` sibling instead of a `paragraph`, and "no quote above" means there is
 * no `blockquote` parent to visit. So the condition is adjacency inside a quote.
 *
 * Scoped to `blockquote` deliberately. A `callout` is a different node type here and
 * the oracle was not asked about it, so it keeps the current behaviour rather than
 * inheriting a rule measured somewhere else.
 *
 * Corpus-wide: 27 firing positions, 6 gain, and the one position that moves the
 * wrong way is in a document already failing in the other direction, so no agreeing
 * document is lost. All six are `extent only` -- every definition and reference
 * already at the right position -- which is why a span this small closes them.
 */
function absorbable(node: RootContent, source: string): boolean {
  if (node.type === "paragraph") return true;
  if (node.type !== "code") return false;

  const at = node.position?.start.offset;
  if (at === undefined) return false;

  // From the LINE START, not from the node's own offset. A code node begins at its
  // first content character, so slicing from there has already dropped the quote
  // marker and the indent -- and every indented block then looks like a fence.
  const from = source.lastIndexOf("\n", at - 1) + 1;
  const to = source.indexOf("\n", at);
  return !FENCE.test(source.slice(from, to === -1 ? undefined : to));
}

export function quoteDefinitionAbsorbTransform(
  tree: Root,
  source: string,
): void {
  const lines = source.split("\n");

  visit(tree, "blockquote", (quote: Blockquote) => {
    const children = quote.children;

    for (let index = 0; index < children.length - 1; index++) {
      const definition = children[index];
      const sibling = children[index + 1];
      if (definition?.type !== "footnoteDefinition") continue;
      if (!absorbable(sibling, source)) continue;

      // The label line must be BARE. A `> [^1]: def` label is a quoted definition
      // whose sibling we already absorb correctly, and absorbing again runs it one
      // line long -- measured at 0 gain / 8 BREAK before this test was restored.
      const label = lines[(definition.position?.start.line ?? 1) - 1] ?? "";
      if (QUOTE.test(label)) continue;

      const span = definition.position;
      const start = sibling.position?.start;
      const siblingEnd = sibling.position?.end;
      if (!span || !start || !siblingEnd) continue;

      // Adjacency from OFFSETS, which is this repo's standing rule: `.line` is
      // rebuilt from offsets by `normalizePointsTransform` at the very end, so any
      // pass before it reading `.line` reads a stale field. Exactly one line ending
      // plus a quote prefix between them -- which is also what excludes a blank line
      // and a `>`-only line, both of which leave two.
      const from = span.end.offset;
      const to = start.offset;
      if (from === undefined || to === undefined) continue;
      if (!ADJACENT.test(source.slice(from, to))) continue;

      definition.children.push(sibling);
      definition.position = {
        start: { ...span.start },
        end: { ...siblingEnd },
      };
      children.splice(index + 1, 1);
      index -= 1;
    }
  });
}
