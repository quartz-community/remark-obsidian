import type { Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface ParentNode extends Node {
  children: RootContent[];
}

const CONTAINERS = new Set([
  "blockquote",
  "callout",
  // A title is both rules at once. `> [!note] $$y` goes through the content-after
  // rule below like any other container, and `> [!note] $$` through the title
  // exception beside it -- a title is one line, so a bare opener can never close.
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
      //
      // Except on a callout's title line, where the container *is* the line.
      // Nothing can follow the opener and nothing can close it, so `> [!note] $$`
      // renders the literal `$$` and reports no formula, while `> $$` over a lazy
      // line reports one. The discriminator is whether the container can continue
      // past the opener's line, not what sits after the opener on it.
      //
      // Tested by line and not by parent type: the `math` node is a *sibling* of
      // `calloutTitle` under `callout`, not a child of it, so asking the parent's
      // type never fires. Sharing the callout's first line is what puts the opener
      // in the title.
      //
      // Thin evidence and worth saying so: the corpus holds exactly two callout
      // titles carrying a `$$`, this one and `> [!note] $$y`, which the rule above
      // already covers. The structural argument is what carries it -- a title is one
      // line by construction -- so a probe wave over title boundaries would be the
      // way to confirm it rather than another fuzz sweep.
      const onTitleLine =
        node.type === "callout" &&
        math.position?.start?.line === node.position?.start?.line;
      if (!onTitleLine && !CONTENT_AFTER_OPENER.test(written)) continue;
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
      // Wrapped in a paragraph, because `math` is FLOW content and `text` is PHRASING: a
      // bare text node is legal inside a `calloutTitle`, which holds phrasing, and illegal
      // as a direct child of a quote, a callout, a list item or a definition. Splicing it
      // unwrapped broke mdast's content model 24 times across six shapes, and the `break`
      // half of those came from downstream -- `remark-breaks` splits a text value's line
      // endings in place, so an unwrapped value put its `break` nodes directly in the
      // container too.
      //
      // Three gates found this before the cause was known, which is why the wrap is here
      // rather than in any of them: the span checker reported overlapping `listItem` spans,
      // `hygiene`'s idempotence check reported five math cases changing on a second run, and
      // only the content model named it.
      const replacement: RootContent =
        node.type === "calloutTitle"
          ? (text as unknown as RootContent)
          : ({
              type: "paragraph",
              children: [text],
              position: {
                start: { ...math.position!.start },
                end: { ...math.position!.end },
              },
            } as unknown as RootContent);
      parent.children.splice(index, 1, replacement);
    }
  });
}
