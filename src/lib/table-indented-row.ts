import type { Root, RootContent, Table } from "mdast";

/**
 * An INDENTED body row ends a piped table; it is not a row of it.
 *
 * Their rules document states it as C2, and live 1.14.4 agrees: a row's style is whether its
 * very first character is `|`, and a row indented by even one space does not start with a
 * pipe, so it is not a row at all. The first line that is not a row ends the table and starts
 * a new block.
 *
 *     | a | b |       obs  table@0-1, paragraph@2
 *     | --- | --- |   was  table@0-2, the indented line absorbed as `tableRow@2`
 *      | c[^2] | d |
 *
 * Stock micromark takes the indented line as a row, so our tree matched upstream rather than
 * Obsidian. The corpus holds ZERO cases of this shape, which is why no gate could see it --
 * the two cases whose text matches a leading-space-before-pipe pattern are both tables INSIDE
 * a container, where the indentation is the container's own content column.
 *
 * ROOT TABLES ONLY, deliberately. C5 says a row's first character is the one after the quote
 * marker or at the item's content column, so inside a container the test is relative to a
 * prefix this pass does not compute -- and both corpus cases are exactly that, `- a` with an
 * indented table and `[^1]: | a | b |` with indented rows under it. Widening this without the
 * prefix arithmetic would break two `match` cases to fix none.
 */
export function tableIndentedRowTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  const children = tree.children;
  for (let index = children.length - 1; index >= 0; index--) {
    const table = children[index];
    if (table?.type !== "table") continue;

    const rows = (table as Table).children;

    // PIPED TABLES ONLY, which the table's own header line decides. C2 states the two styles
    // separately: in a piped table a row starts with `|`, and in a PIPELESS one a row does
    // NOT start with `|` and merely holds one somewhere. Testing every table for a leading
    // pipe therefore cuts the first body row off every pipeless table -- four corpus cases,
    // `table/short-center-unbordered`, `probe/table-label/pipeless` and two
    // `hunt/pipeless-header-row-under-label` rows, all of which the corpus caught at once.
    const headerFrom = rows[0]?.position?.start?.offset;
    if (headerFrom === undefined) continue;
    const headerBol = source.lastIndexOf("\n", headerFrom - 1) + 1;
    if (source[headerBol] !== "|") continue;

    // Body rows only: the header is `rows[0]` and the delimiter line is not a row at all.
    let cut = -1;
    for (let row = 1; row < rows.length; row++) {
      const from = rows[row]?.position?.start?.offset;
      if (from === undefined) continue;
      const bol = source.lastIndexOf("\n", from - 1) + 1;
      if (source[bol] !== "|") {
        cut = row;
        break;
      }
    }
    if (cut === -1) continue;

    const keepTo = rows[cut - 1]?.position?.end?.offset;
    const restFrom = rows[cut]?.position?.start?.offset;
    const tableEnd = table.position?.end?.offset;
    if (
      keepTo === undefined ||
      restFrom === undefined ||
      tableEnd === undefined
    ) {
      continue;
    }

    // From the line's own start, not the row's: the row begins past the indentation and
    // re-parsing without it would drop the spaces the paragraph keeps.
    const restBol = source.lastIndexOf("\n", restFrom - 1) + 1;
    const rest = reparse(source.slice(restBol, tableEnd)).children;
    if (rest.length === 0) continue;
    for (const node of rest) shiftOnto(node, restBol);

    rows.splice(cut);
    // One offset before the departing row's LINE, not the last remaining row's end. A table's
    // span covers its delimiter line, which is no row at all, so taking the last row's end
    // left `table@0-0` where the table really runs to the delimiter on line 1.
    //
    // Only the offset is set; `normalizePointsTransform` rebuilds line and column from it
    // afterwards, which is the rule every pass here follows.
    if (table.position?.end) table.position.end.offset = restBol - 1;
    children.splice(index + 1, 0, ...(rest as RootContent[]));
  }
}

/** Place a re-parsed fragment onto the document, offsets only. */
function shiftOnto(node: unknown, offset: number): void {
  const candidate = node as {
    position?: { start: { offset?: number }; end: { offset?: number } };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.offset = offset + (point.offset ?? 0);
    }
  }
  for (const child of candidate.children ?? []) shiftOnto(child, offset);
}
