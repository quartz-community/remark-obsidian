import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import type { Node } from "unist";

import { parseOurs } from "./chain.js";
import type { GoldenCase } from "./types.js";

const goldenPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "goldens",
  "obsidian.json",
);

/** Line and column of an absolute offset, counting from one as mdast does. */
const pointOf = (source: string, offset: number): [number, number] => {
  const before = source.slice(0, offset);
  return [
    before.split("\n").length,
    offset - (before.lastIndexOf("\n") + 1) + 1,
  ];
};

/**
 * Points whose declared line and column disagree with their own offset.
 *
 * A transform that moves a fragment has to place three numbers, and an offset
 * is the easy one -- a shift can add to it, while a line and a column have to
 * be recomputed. So the two halves drift apart, and the node ends up claiming
 * two different places at once.
 */
const inconsistent = (tree: Root, markdown: string): string[] => {
  const found: string[] = [];
  visit(tree, (node: Node) => {
    const position = node.position;
    if (!position) return;
    for (const [side, point] of [
      ["start", position.start],
      ["end", position.end],
    ] as const) {
      if (point.offset === undefined) continue;
      const [line, column] = pointOf(markdown, point.offset);
      if (point.line === line && point.column === column) continue;
      found.push(
        `${node.type}.${side}@${point.offset} declared=[${point.line},${point.column}] derived=[${line},${column}]`,
      );
    }
  });
  return found;
};

/** Nodes spliced into the tree with no position at all. */
const unplaced = (tree: Root): string[] => {
  const found: string[] = [];
  visit(tree, (node: Node, _index, parent) => {
    if (node.type === "root" || node.position) return;
    found.push(`${(parent as Node | null)?.type ?? "?"} > ${node.type}`);
  });
  return found;
};

/**
 * A node's position is what a consumer edits by.
 *
 * Obsidian Linter rewrites a note by splicing at offsets, and the saved
 * `computeMetadataAsync` answers report a footnote's line and column, so a
 * point that disagrees with itself is not cosmetic: it either moves an edit to
 * the wrong place or makes the answer uncomparable. Measured against those
 * answers, every reference whose declared line was wrong had an offset that
 * derived Obsidian's own line and column exactly -- which is why the offsets
 * are treated as the truth and `normalizePointsTransform` rebuilds the rest.
 */
describe("node positions", () => {
  const file = JSON.parse(fs.readFileSync(goldenPath, "utf8")) as {
    cases: Record<string, GoldenCase>;
  };
  const cases = Object.values(file.cases);

  it("audits the whole corpus", () => {
    expect(cases.length).toBeGreaterThan(1000);
  });

  it("never lets a point disagree with its own offset", () => {
    const offenders: string[] = [];
    for (const entry of cases) {
      const bad = inconsistent(
        parseOurs(entry.markdown, "quartz-default"),
        entry.markdown,
      );
      if (bad.length > 0) offenders.push(`${entry.id}: ${bad[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * The passes that rebuild a block still splice some nodes with no position,
   * and a node without one is invisible to both the lossiness gate above and
   * anything that edits by offset -- so this is a ceiling to drive down, not a
   * state to accept. Enumerated per parent and child rather than totalled, so
   * a new kind cannot hide inside a falling count.
   *
   * A `break` carries no value and so misplaces nothing, which is why the
   * remaining bulk is tolerable; a `text` or a `footnoteReference` does, and
   * those are the ones worth removing next. `footnoteInterruptTransform` was
   * the first: positioning its splices took `paragraph > footnoteReference`
   * from 62 to 14 and let the bare-reference pass read labels from the source.
   *
   * The block-identifier and list-item probes added one more of each; the
   * eleven line-ending and counter probes added three more of each; the
   * CRLF documents carry the same folds with a two-character line ending.
   *
   * `legacyDefinitionTransform` was the largest source of all, found by
   * shrinking an external document to `[o]:[^1]`: a line it keeps verbatim
   * because re-parsing it yields a definition again, spliced without a span.
   *
   * `setextDefinitionTransform` was another, found by shrinking an
   * external document to `[^1]:x` over `=`: it built the heading's text from the
   * raw line without a span, which left every reference inside it unplaceable.
   *
   * Positioning the three remaining splicers -- `paragraph-merge`,
   * `comment-in-definition` and `table-pipe-style` -- took these down rather
   * than up, and closed a reference gap the positioned oracle was tracking.
   *
   * `paragraph > break` and `paragraph > text` each rose by five when
   * `parseComments` landed, and that rise is a larger tree rather than a
   * regression: a comment's body is parsed now, so the same passes that splice
   * an unplaced `break` run over those blocks too. Recorded here rather than
   * absorbed, because a ceiling that moves without a reason is not a ceiling.
   *
   * Four rounds then took the total from 1188 nodes to 49, each by finding where a
   * node is built rather than by widening this list:
   *
   * - `remark-breaks` is four lines that replace a newline with a bare
   *   `{type: "break"}` and rebuild the surrounding text unplaced.
   *   `breakPositionsTransform` does the same conversion first, with positions,
   *   leaving its regular expression nothing to match. 1188 -> 168.
   * - Five passes that fold lines back into a paragraph pushed an unplaced
   *   newline separator each, which `remark-breaks` then turned into an unplaced
   *   `break`. 168 -> 68.
   * - `tableShortDelimiterTransform` built rows and cells from the line text with
   *   no offset to place them by. 68 -> 52.
   * - `bareFootnoteRefTransform`'s value-to-source aligner modelled escapes but
   *   not character references, so a text node holding an entity could not align
   *   and everything spliced out of it lost its position *and* its written label.
   *   52 -> 49, and two parity cases with it.
   *
   * What is left is no longer one mechanism, and the causes are known:
   *
   * - `foo&#10;&#10;bar` is declined on purpose. A newline written as a reference
   *   puts one in the value with none in the source, so the counts stop
   *   corresponding and any offset would be a guess.
   * - The six `calloutTitle`s come from two sites. One builds an empty title when
   *   the title line is a block, so there are no children to derive a span from;
   *   the other derives one from its children and gets nothing when they have
   *   none. Both would need the title's own span, and the marker is stripped from
   *   the lead text's value while its position still covers it.
   * - The rest are individual cases rather than a family: a lazily continued
   *   indented line, an autolink holding an escape.
   *
   * Worth knowing before widening any of these: a wrong offset is worse than a
   * missing one, because it still looks usable. Two passes shipped
   * fragment-relative positions before that rule was written down.
   */
  const UNPLACED_CEILING = {
    "callout > calloutTitle": 8,
    "heading > footnoteReference": 2,
    "link > text": 2,
    "paragraph > break": 7,
    "paragraph > footnoteReference": 7,
    "paragraph > link": 2,
    "paragraph > text": 10,
  };

  it("does not splice more unplaced nodes than the recorded ceiling", () => {
    const byKind = new Map<string, number>();
    for (const entry of cases) {
      for (const kind of new Set(
        unplaced(parseOurs(entry.markdown, "quartz-default")),
      )) {
        byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries([...byKind].sort())).toEqual(UNPLACED_CEILING);
  });
});
