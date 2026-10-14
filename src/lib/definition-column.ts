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

/** The column an item's own content begins at, past its marker and one space. */
function contentColumn(source: string, item: ListItem): number | undefined {
  const from = item.position?.start?.offset;
  if (from === undefined) return undefined;
  const bol = source.lastIndexOf("\n", from - 1) + 1;
  const nl = source.indexOf("\n", from);
  const line = source.slice(bol, nl === -1 ? undefined : nl);
  const opener = MARKER.exec(line);
  if (!opener) return undefined;
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
  return /^[ \t]*\d\.[ \t]$/u.test(opener[0]!)
    ? opener[0]!.length + 1
    : opener[0]!.length;
}
