import type { FootnoteDefinition, ListItem, Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

const MARKER = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/u;

/**
 * A footnote definition starts at its containing block's content column.
 *
 * Obsidian reports the start of the *block*, not the position of the `[`, and the
 * indentation in between belongs to the definition:
 *
 *     ' [^1]: def'                -> 0:0   root, so column zero
 *     '  [^1]: def'               -> 0:0
 *     '   [^1]: def'              -> 0:0
 *     '- a' / '' / '    [^1]: x'  -> 2:2   the item's content column, not the bracket at 4
 *
 * Read alone the bare rows look like indentation being lost. The container rows rule
 * that out, and Obsidian's own section agrees with them -- ` [^1]: def` is reported as
 * `footnoteDefinition@0:0-0:10`, starting at zero rather than at the bracket.
 *
 * Fires where the definition's own line prefix is whitespace, or a quote prefix followed
 * by whitespace. A LIST marker in the prefix keeps the pass away from cases that already
 * agree: `- [^1]: def` reports 0:2, `-  [^1]: def` reports 0:3, and `- [ ] [^1]: def` and
 * `- [ ]  [^1]: def` both report 0:6.
 *
 * A quote marker used to be excluded on the same reasoning and that was wrong. `> [^1]:
 * def` agrees at 0:2 only because the bracket happens to sit AT the content column; move
 * it and the agreement goes with it, since `>  [^1]: def` and `>   [^1]: def` are 0:2 to
 * Obsidian as well. So a quote contributes a content column of its own -- the marker plus
 * the one space it consumes -- exactly as a list item does.
 */
export function definitionColumnTransform(tree: Root, source: string): void {
  if (source === "") return;

  // The INNERMOST enclosing item owns the definition's column. `visit` is pre-order, so
  // an outer item is seen before the inner one and overwriting is what keeps the inner:
  // `- a` / `  - b` / blank / `    [^1]: def` is column 4 in Obsidian, the inner item's
  // content column, where keeping the first writer gave the outer item's 2.
  const items = new Map<Node, ListItem>();
  visit(tree, "listItem", (item: Node) => {
    visit(item, (inner: Node) => {
      items.set(inner, item as ListItem);
    });
  });

  // A FOOTNOTE DEFINITION is a host too, and this map is the whole of that rule.
  //
  // The list map above was the only one, so a definition absorbed into another definition found
  // no host and was clamped to column 0. Obsidian gives it the bracket:
  //
  //     [^ä]: def / blank / ⟨2sp⟩⇥[^ch2*]: body text     obs column 3, ours 0
  //
  // Both sides agree the outer definition spans all three lines, so the inner one is its child.
  // Its content column is 4 -- the standard continuation indent -- and the `column > bracket -
  // gap` decline below then yields `min(indent, 4)` with no new arithmetic: indent 3 declines
  // to the bracket, indent 6 takes the 4. Scored better 5 / worse 0 before being built.
  const inDefinition = new Set<Node>();
  visit(tree, "footnoteDefinition", (host: Node) => {
    visit(host, (inner: Node) => {
      if (inner !== host) inDefinition.add(inner);
    });
  });

  // Both definition kinds, because Obsidian applies one rule to them. A LINK reference
  // definition's column follows `min(indent, hostContentColumn)` exactly as a footnote
  // definition's does: `   [foo]: /url` at root is reported at column 0, and
  // `- a` / `- b` / blank / `  [ref]: /url` inside an item is reported at the item's content
  // column of 2. Both come from `referenceLinks`, which the recorder has stored on every
  // case since the first run and which nothing compared until now -- 111 non-empty answers
  // that were dormant in the goldens.
  visit(tree, ["footnoteDefinition", "definition"], (node: Node) => {
    const definition = node as FootnoteDefinition;
    const start = definition.position?.start;
    if (!start || start.offset === undefined) return;

    const bol = source.lastIndexOf("\n", start.offset - 1) + 1;
    const prefix = source.slice(bol, start.offset);
    // Any horizontal whitespace, or a quote prefix followed by it. A tab USED to be
    // excluded here, on the arbiter's reading that `remark-parse@8` does not count a tab
    // following a space -- so ` \t[^1]: def` is re-parsed and placed back past that
    // whitespace at offset 2, which this pass would overwrite with zero.
    //
    // The referee overturned it. That corpus carries 106 rows whose definition line has a
    // tab in its prefix, and Obsidian reports the content column for them too: `  \t[^ä]:
    // Definition` is column 0, not 3. Honouring it moved 25 of those documents into
    // agreement with zero parity regressions. The legacy stack is an arbiter, not an
    // oracle, and the recorded Obsidian answers win where they disagree.
    // A comment CLOSER contributes a content column too, one past itself: `> %%` /
    // `> hidden` / `> %% [^1]: freed` reports the definition at 4:4, where the `%%` sits
    // at columns 2 and 3. Only a closer needs handling -- `%% h %% [^1]: x` and
    // `> %% h %% [^1]: x` define NOTHING, so a definition behind an opener never arrives.
    const quoted = /^((?:>[ \t]?)+(?:%%)?)[ \t]*$/u.exec(prefix);
    // A list marker whose separator run holds a TAB. Measured over the referee corpus by
    // what column Obsidian reports for a definition behind a marker:
    //
    //   separator one character, space or tab   contentCol   600 + 184
    //   separator longer, all spaces            BRACKET      282
    //   separator longer, holds a tab           contentCol    61
    //
    // Zero counter-examples in the last bucket, and the third is what we already do. So a
    // tab anywhere in the run puts the definition at the marker plus ONE character and
    // the rest of the run belongs to the definition, while a run of spaces leaves it at
    // the bracket. `1.⇥ [^Ω]: def` is column 3, not 4.
    //
    // Split into a match plus two plain tests rather than one pattern: the combined form
    // nests `[ \t]` quantifiers around a lookahead and the ReDoS lint rejects it as a
    // second-degree polynomial, which it is.
    const marker = /^[ \t]*(?:[-*+]|\d{1,9}[.)])/u.exec(prefix);
    const run = marker ? prefix.slice(marker[0].length) : "";
    const tabbed =
      marker && run.length > 1 && run.includes("\t") && !/[^ \t]/u.test(run)
        ? marker
        : null;
    if (!quoted && !tabbed && !/^[ \t]+$/u.test(prefix)) return;
    // A NO-PREFIX definition absorbed into a NESTED container is the one measured shape this
    // early return gets wrong, and it is left alone deliberately. `compose.mts --nested` has
    // `quote > callout > footnote` as its only remaining row, and the rule is confirmed over
    // three depths rather than inferred:
    //
    //     > [!note] title     / [^1]: def    column 0   (we agree)
    //     > > [!note] title   / [^1]: def    column 2
    //     > > > [!note] title / [^1]: def    column 4
    //
    // So the column is the content column of the container ENCLOSING the callout -- the
    // prefix without its innermost marker -- which is 2 per level of nesting above one.
    // The definition's own line carries no prefix at all in every case, so reading the line
    // cannot produce it; the depth has to come from the tree after absorption.
    //
    // Not implemented because this return guards EVERY root definition, which is correctly
    // column 0, and the firing condition would have to distinguish "absorbed into a nested
    // container" from "at root" without a prefix to key on.
    //
    // NOW SCORED, both ways, and neither says to build it. `score.mts` holds both:
    //
    //   nested-container-definition-column   better 0  worse 5  net negative
    //   nested-quote-definition-column       better 0  worse 0  TOUCHED 0 of 6,818
    //
    // The general form is actively WRONG: all five of its counter-examples nest through a
    // LIST and want column 0, which is the list/quote asymmetry met again. Narrowed to
    // quotes and callouts -- the form the probes actually measured -- it touches NOTHING in
    // the referee corpus, so that oracle cannot call it safe or unsafe.
    //
    // Which leaves one `compose.mts --nested` row as the whole evidence for it, against the
    // twelve recorded probes behind the column-0 behaviour this return protects. Declined on
    // those terms, which is the same trade as the quote-tab rule.

    // A quote contributes its own content column, which is the marker plus the one space
    // it consumes -- anything further along the prefix belongs to the definition. The
    // docstring's claim that these "never reach this pass" was true and hid two cases:
    // `> [^1]: def` agrees at 0:2 only because the bracket happens to sit AT the content
    // column, while `>  [^1]: def` and `>   [^1]: def` are both 0:2 to Obsidian and were
    // reported at the bracket.
    const host = items.get(node);
    // A TAB in the definition's own indent puts it just past the tab run, whatever the
    // host's content column is: `- p` / blank / `⇥ [^1]: def` is column 1 and
    // `-⇥p` / blank / `⇥  [^1]: def` is column 1 too. Same rule the `listItems` key
    // measured across four cases -- a tab contributes exactly one column.
    // Counted rather than matched: `/^(\t+)[ \t]*$/` is a second-degree polynomial to the
    // ReDoS lint, since both quantifiers can consume a tab.
    let tabRun = 0;
    while (tabRun < prefix.length && prefix[tabRun] === "\t") tabRun += 1;
    const indentTabs =
      tabRun > 0 && !/[^ \t]/u.test(prefix) ? tabRun : undefined;
    const column = indentTabs
      ? indentTabs
      : tabbed
        ? tabbed[0].length + 1
        : quoted
          ? quoted[1]!.length
          : host
            ? contentColumn(source, host)
            : inDefinition.has(node)
              ? 4
              : 0;
    if (column === undefined) return;
    // One column for every host. The gap-TWO rule this replaces was fitted to
    // `1. item` / `    [^1]:` reporting the bracket at 4 while `- item` / `    [^1]:`
    // reports 2 -- and the single-digit-dot adjustment in `contentColumn` explains that
    // pair directly, so the gap is not what separated them. Twelve probes now fit
    // `min(indent, contentColumn)` with no gap term at all.
    const gap = indentTabs ? 0 : 1;
    // The bracket's column comes from the OFFSET, not from `start.column`. A definition
    // arrives here with a stale column -- `> %% [^1]: freed` carries column 2 against
    // offset 26, which is column 5 -- because an earlier pass moved it by offset and left
    // the rest of the point behind, which is precisely what `normalizePointsTransform`
    // runs last to repair. Reading the stale field made this pass decline the case it was
    // extended for, and the decline was invisible: the final tree showed the bracket
    // position either way.
    //
    // This is the repo's own rule applied to itself. `normalize-points.ts` states that
    // offsets are what the passes maintain and the rest of a point is rebuilt from them,
    // so any pass running before it must read the offset.
    const bracket = start.offset - bol;
    if (column > bracket - gap) return;

    start.column = column + 1;
    start.offset = bol + column;
  });
}

/**
 * B3: the SMALLEST indentation among the item's own lines, or Infinity if it has none.
 *
 * `remark-parse@8` strips an item's continuation lines by their smallest indentation, and
 * Obsidian leaves UNINDENTED lines out of that minimum -- which is the whole rule, and the half
 * this package was missing. Ten probes against live 1.14.4 are in `goldens/rules-doc.json`, and
 * the five that already agreed are what make the other five a rule rather than a shape:
 *
 *     - a / lazy(col 0) / ⟨4sp⟩[^1]:    column 2   a column-0 line is EXCLUDED
 *     - a / ⟨1sp⟩lazy   / ⟨4sp⟩[^1]:    column 1   an indented one is counted
 *     -⟨3sp⟩a / ⟨1sp⟩lazy / ⟨4sp⟩[^1]:  column 1   marker width 4, answer still 1
 *
 * A tab counts to its four-column stop, as everywhere else here. Blank lines carry no
 * indentation to minimise over and a column-0 line is a LAZY continuation, which Obsidian does
 * not let pull the column down -- the two exclusions are different rules that happen to share
 * a guard.
 */
function deIndentFloor(source: string, item: ListItem): number {
  const from = item.position?.start?.offset;
  const to = item.position?.end?.offset;
  if (from === undefined || to === undefined) return Number.POSITIVE_INFINITY;
  const second = source.indexOf("\n", from);
  if (second === -1 || second >= to) return Number.POSITIVE_INFINITY;

  let floor = Number.POSITIVE_INFINITY;
  for (const line of source.slice(second + 1, to).split("\n")) {
    let column = 0;
    for (const character of line) {
      if (character === " ") column += 1;
      else if (character === "\t") column += 4 - (column % 4);
      else break;
    }
    if (column === line.length) continue;
    if (column > 0 && column < floor) floor = column;
  }
  return floor;
}

/**
 * The column an item's own content begins at, past its marker and one space.
 *
 * EXPORTED for `test/parity/score.mts`, and that is a correctness measure rather than a
 * convenience. Six scored premises about this quantity have now been refuted by their own
 * arithmetic rather than by the rule they were testing -- a host keyed on line ranges, a
 * minimum taken across overlapping items, indentation measured from column zero inside a
 * quote, nested blocks entering the minimum, `- [ ] ` read as two columns, and `1.⟨5sp⟩` read
 * as seven where the five-space cap makes it four. Every one of them re-derived what this
 * function already computes, and each wrong number read exactly like evidence about B3.
 *
 * So a candidate rule about the content column calls THIS, and a divergence between the
 * scorer and the pass is then impossible by construction rather than by review.
 */
export function contentColumn(
  source: string,
  item: ListItem,
): number | undefined {
  const from = item.position?.start?.offset;
  if (from === undefined) return undefined;
  const bol = source.lastIndexOf("\n", from - 1) + 1;
  const nl = source.indexOf("\n", from);
  const line = source.slice(bol, nl === -1 ? undefined : nl);
  const opener = MARKER.exec(line);
  if (!opener) return undefined;
  // Applied to BOTH paths below, because the marker's width is only ever an upper bound: a
  // continuation line indented below it pulls the content column down with it, and the
  // five-space cap is the same quantity measured a different way.
  const floor = deIndentFloor(source, item);
  // FIVE OR MORE spaces after the marker and the content column falls back to the marker plus
  // ONE, because CommonMark makes that much indentation the item's own indented CODE rather
  // than a wider content column.
  //
  //     *⟨9sp⟩item / blank / ⟨4sp⟩[^1]: def    column 2, where marker+all-spaces gives 10
  //     -⟨5sp⟩item / blank / ⟨2sp⟩[^1]: def    column 2 either way
  //
  // Only visible when the definition's own indent EXCEEDS the capped column, which is why one
  // of seven probed shapes moved and six did not -- `min(indent, contentColumn)` hides the
  // difference whenever the indent is the smaller of the two. All twelve probes this function
  // already carries have a run under five and are untouched.
  // The capped column is the marker plus ONE SEPARATOR, and that separator is measured the
  // same two ways the uncapped path already measures the whole run. Skipping either cost
  // seven referee documents in one class:
  //
  //     1.⟨6sp⟩~~~ / ⟨4sp⟩[^Note]: def    column 4, not 3 -- the single-digit-dot adjustment
  //     +⇥⟨4sp⟩Text / ⟨4sp⟩[^2]: More     column 4, not 2 -- a tab reaches its column stop
  //     1.⇥⟨4sp⟩More / ...                column 4, and NOT 5: a tab already reaches 4, so
  //                                       the dot adjustment must not apply on top of it
  const split = /^([ \t]*(?:[-*+]|\d{1,9}[.)]))([ \t]*)/u.exec(line);
  if (split && split[2]!.length >= 5) {
    const marker = split[1]!;
    const tabbed = split[2]![0] === "\t";
    const base = tabbed
      ? marker.length + (4 - (marker.length % 4))
      : marker.length + 1;
    const capped = !tabbed && /^[ \t]*\d\.$/u.test(marker) ? base + 1 : base;
    return Math.min(capped, floor);
  }
  // A SINGLE-DIGIT marker ending in a dot counts one column more than it occupies, which
  // is the `1.  foo` quirk already recorded for list items, reaching the definition column
  // too. Twelve probes vary the marker's width against the indent and all twelve fit
  // `min(indent, contentColumn)` with this one adjustment:
  //
  //   `- `    2    indent 3,4,5  ->  2 2 2        `12. `  4    indent 4,5,6  ->  4 4 4
  //   `1. `   3+1  indent 3,4,5  ->  3 4 4        `*  `   3    indent 4      ->  3
  //   `1) `   3    indent 4      ->  3            `-   `  4    indent 5      ->  4
  //
  // `1. ` against `1) ` is what isolates it: same width, same indent, columns 4 and 3.
  const width = /^[ \t]*\d\.[ \t]$/u.test(opener[0]!)
    ? opener[0]!.length + 1
    : opener[0]!.length;
  return Math.min(width, floor);
}
