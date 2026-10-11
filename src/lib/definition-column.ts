import type { FootnoteDefinition, ListItem, Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

const MARKER = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]/u;

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

  const items = new Map<Node, ListItem>();
  visit(tree, "listItem", (item: Node) => {
    visit(item, (inner: Node) => {
      if (!items.has(inner)) items.set(inner, item as ListItem);
    });
  });

  visit(tree, "footnoteDefinition", (node: Node) => {
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

    // A quote contributes its own content column, which is the marker plus the one space
    // it consumes -- anything further along the prefix belongs to the definition. The
    // docstring's claim that these "never reach this pass" was true and hid two cases:
    // `> [^1]: def` agrees at 0:2 only because the bracket happens to sit AT the content
    // column, while `>  [^1]: def` and `>   [^1]: def` are both 0:2 to Obsidian and were
    // reported at the bracket.
    const host = items.get(node);
    const column = tabbed
      ? tabbed[0].length + 1
      : quoted
        ? quoted[1]!.length
        : host
          ? contentColumn(source, host)
          : 0;
    if (column === undefined) return;
    // A LIST-ITEM host needs the indent to clear its content column by TWO, not one.
    // Probed with one host against a varying indent, which is what separates the two
    // shapes that had contradicted each other for weeks:
    //
    //   `- item`  / blank / `    [^1]:`   content 2, indent 4, gap 2  ->  column 2
    //   `- item`  / blank / `     [^1]:`  content 2, indent 5, gap 3  ->  column 2
    //   `1. item` / blank / `    [^1]:`   content 3, indent 4, gap 1  ->  column 4
    //
    // The last one is the bracket, and `hunt/list-item-label-margin/1` is the same shape.
    // A root or quote host keeps the one-column test: ` [^1]: def` is column 0 at gap 1,
    // and `>  [^1]: def` is column 2 at gap 1, so the stricter rule belongs to the item.
    const gap = host && !quoted && !tabbed ? 2 : 1;
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
  const opener = MARKER.exec(source.slice(bol, nl === -1 ? undefined : nl));
  return opener ? opener[0]!.length : undefined;
}
