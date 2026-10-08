import type { Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface ParentNode extends Node {
  children: RootContent[];
}

const CONTAINERS = new Set([
  "blockquote",
  "callout",
  // A title too, but only through the content-after rule below. `> [!note] $$y`
  // has no formula, and neither does `> [!note] $$` -- that second one is the
  // separate title-boundary rule and stays recorded rather than handled here.
  "calloutTitle",
  "listItem",
  "footnoteDefinition",
]);

/** A `$$` run closing the block, allowing trailing whitespace. */
const CLOSED = /\$\$[ \t]*$/u;
/** An opener with its formula starting on the same line. */
const CONTENT_AFTER_OPENER = /^\$\$[ \t]*\S/u;

/**
 * Inside a container, an unclosed `$$` does not open display math.
 *
 * Measured by `probe/math-unclosed/*`. `> $$y^2` is a blockquote whose rendered
 * text is the literal `$$y^2` and whose math list is **empty**; the same holds for
 * `> [!note] $$` and for a tab-indented `$$y` under a task. Close the run and it is
 * math again -- `> tail $$` / `> x` / `> $$` and `> $$` / `> x^2` / `> $$` both
 * report a formula, and both already matched.
 *
 * At the document level the opposite holds and we already agree: `$$y^2` alone
 * reports `math@0:0-1:0` and swallows to end of block, as do `$$y^2` over `word`
 * and over a blank line. So the rule is about the container, not the delimiter --
 * an opener that cannot close before its container ends stays literal.
 *
 * Two sites produce the node this undoes, which is why it is a pass of its own
 * rather than a condition inside either: micromark opens the block itself for
 * `> $$y^2`, while `mathMidlineTransform` opens it for `> [!note] $$`, where bare
 * micromark reports only a paragraph.
 */
export function mathUnclosedContainerTransform(
  tree: Root,
  source: string,
): void {
  visit(tree, (node: Node) => {
    if (!CONTAINERS.has(node.type)) return;
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const math = parent.children[index]!;
      // Display blocks only. A single-dollar span is a different construct and
      // never ends in `$$`, so including `inlineMath` demoted every one of them --
      // `> [!note] $x^2$` and `> [!note] $x$ \`$y$\`` both lost their formula.
      if (math.type !== "math") continue;

      const from = math.position?.start?.offset;
      const to = math.position?.end?.offset;
      if (from === undefined || to === undefined) continue;

      const written = source.slice(from, to);
      // Closed runs keep their formula: `> tail $$` / `> x` / `> $$` is math, and
      // `$$x$$` on one line is too.
      if (written.length > 2 && CLOSED.test(written)) continue;
      // And an opener alone on its line still opens one, even unclosed. `> $$`
      // over a lazy `lazy` is math holding `lazy`, which is the rule
      // `math-outlives.ts` exists for -- eleven cases depend on it. Only an opener
      // whose formula *starts on the opener's own line* and never closes is
      // literal, which is what every probe in this family has.
      if (!CONTENT_AFTER_OPENER.test(written)) continue;
      // And the opener has to be *inside* the container, not merely under a node
      // that is. `- item` / `  [^37]: a` / `x $$` / `$$ tail` has its opener at
      // column zero as a lazy line, and Obsidian opens math there -- the arbiter
      // agrees, giving `math("tail")` for `x $$` over `$$ tail`. A line carrying no
      // container prefix is root-level however deep the tree says it sits.
      const lineStart = source.lastIndexOf("\n", from - 1) + 1;
      const prefix = source.slice(lineStart, from);
      if (prefix === "") continue;
      // Any non-empty prefix qualifies. Restricting it to whitespace and `>` let
      // `- $$y`, `1. $$y^2`, `- [ ] $$y^` and `> [!note] $$y` through, since each
      // carries a list or callout marker instead -- four independent sweep failures
      // reduced onto exactly that. The emptiness test above is what distinguishes a
      // genuine container from a lazy line at column zero, and it is sufficient.

      const text: Text = {
        type: "text",
        value: written,
        position: {
          start: { ...math.position!.start },
          end: { ...math.position!.end },
        },
      };
      parent.children.splice(index, 1, text as unknown as RootContent);
    }
  });
}
