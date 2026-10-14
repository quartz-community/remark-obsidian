import type { Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/** A marker on its own line, captured so its width and shape can both be read. */
const MARKER = /^[ \t]*((?:[-*+]|\d{1,9}[.)]))[ \t]+/u;

/**
 * A single-digit `1.` marker pushes its item's CODE THRESHOLD out by one too.
 *
 * `definition-column.ts` already records that such a marker "counts one column more than it
 * occupies", measured over twelve probes: `1. ` reports a definition column of 4 where `1) `
 * reports 3, same width and same indent. What it does not record is that the same adjustment
 * moves where indented CODE begins, which is B2's table read across two of its rows:
 *
 *     1)   1-2 outside, 3-6 inside, 7+ code
 *     1.   1-2 outside, 3-7 inside, 8+ code
 *
 * Asked of live 1.14.4, and only the `1.` row at indent seven disagrees with us -- every other
 * marker and indent in the family already matches:
 *
 *     1. item / blank / ⟨7sp⟩[^1]: def     column 4, and we produce NO definition
 *     1. item / blank / ⟨8sp⟩[^1]: def     code on both sides
 *     1) item / blank / ⟨6sp⟩[^1]: def     column 3 on both sides
 *     12. item / blank / ⟨7sp⟩[^1]: def    column 4 on both sides
 *
 * micromark takes the item's content column as 3 for `1. `, so seven spaces is four past it
 * and becomes `code`. Obsidian's effective column is 4, so seven is three past and the line is
 * the item's own content.
 *
 * WHY A SEPARATE PASS. `quoteIndentedCodeTransform` re-parses this exact shape, and its
 * list-item branch requires the MARKER ON THE SAME LINE as the code -- its own comment says an
 * item whose code starts on a later line "carries only indentation and is left alone, since
 * its width is the measured content column rather than anything on this line". That is the
 * case here, so this is a different code path rather than a wider guard, and keeping it apart
 * leaves that pass's measured scoping untouched.
 *
 * SCOPED TO THE SINGLE-DIGIT DOT, because that is the whole of the measured difference. Every
 * other marker agrees at every indent probed, so widening this would be changing behaviour
 * the app already endorses -- and `quote-indented-code.ts` records a 27-document loss from
 * exactly that mistake in the neighbouring tab rule.
 */
export function itemDotThresholdTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  visit(tree, "listItem", (node: Node) => {
    const item = node as Partial<{ children: RootContent[] }> & {
      position?: { start: { line: number; offset?: number } };
    };
    if (!Array.isArray(item.children)) return;
    const itemLine = item.position?.start?.line;
    const itemFrom = item.position?.start?.offset;
    if (itemLine === undefined || itemFrom === undefined) return;

    const itemBol = source.lastIndexOf("\n", itemFrom - 1) + 1;
    const nl = source.indexOf("\n", itemFrom);
    const markerLine = source.slice(itemBol, nl === -1 ? undefined : nl);
    const marker = MARKER.exec(markerLine);
    if (!marker) return;
    // `1.` FOLLOWED BY EXACTLY ONE SPACE, which is the whole of what was measured.
    //
    // Keying the threshold on `marker[0].length` -- the marker plus its entire separator run
    // -- broke five CommonMark list-item cases at once, `274` and `286` through `290`. Each
    // has a WIDE separator: `1.⟨6sp⟩indented code` over `⟨7sp⟩more code`, where that width
    // made the threshold 13 and swallowed a line Obsidian leaves as the item's code.
    //
    // Only `1. item` with a single space was ever probed, and generalising from it to every
    // dot marker was the mistake. `definition-column.ts` records the related rule -- a run of
    // five or more caps the content column -- so a wide separator is its own shape with its
    // own answer, and it is left alone here rather than guessed at.
    if (!/^[ \t]*\d\. $/u.test(marker[0])) return;

    const lines = source.split("\n");

    for (let index = 0; index < item.children.length; index++) {
      const block = item.children[index];
      if (block?.type !== "code" || block.lang !== null) continue;
      const from = block.position?.start?.offset;
      const to = block.position?.end?.offset;
      const line = block.position?.start?.line;
      if (from === undefined || to === undefined || line === undefined) {
        continue;
      }
      // A later line only; the same-line case belongs to `quoteIndentedCodeTransform`.
      if (line === itemLine) continue;

      const bol = source.lastIndexOf("\n", from - 1) + 1;
      const whole = source.slice(bol, to);
      // One line, so the splice stays a single node -- the same restriction the neighbouring
      // pass carries for the same reason.
      if (whole.includes("\n")) continue;
      // The item's SMALLEST indentation, which can be lower than its marker's content column.
      //
      // Their B3: `remark-parse` strips an item's lines by the smallest indentation among them,
      // and Obsidian keeps that behaviour for lines that are indented at all. So in
      // `1. a` / `⟨2sp⟩b` / blank / `⟨7sp⟩[^1]: x` the `b` at indent 2 pulls the column down to
      // 2, code begins at 6, and seven spaces is code -- Obsidian reports no definition there,
      // where the marker's own column of 4 would have admitted one. Measured as a loss before
      // this was folded in.
      //
      // Column-0 lines are excluded, which is the rest of B3: "Obsidian leaves unindented lines
      // out of the minimum", so a lazy line at column zero does not collapse the item.
      let least = marker[0].length + 1;
      for (let at = itemLine; at < line - 1; at++) {
        const text = lines[at] ?? "";
        if (text.trim() === "") continue;
        const indent = at === itemLine - 1 ? least : columnsOf(text);
        if (indent > 0 && indent < least) least = indent;
      }
      const threshold = least + 4;
      if (columnsOf(whole) >= threshold) continue;

      const parsed = reparse(whole.replace(/^[ \t]+/u, "")).children[0];
      if (!parsed || parsed.type === "code") continue;
      shiftOnto(
        parsed,
        bol + (whole.length - whole.replace(/^[ \t]+/u, "").length),
      );
      item.children.splice(index, 1, parsed);
    }
  });
}

/** Leading whitespace in COLUMNS, a tab reaching the next four-stop. */
function columnsOf(line: string): number {
  let column = 0;
  for (const character of line) {
    if (character === " ") column += 1;
    else if (character === "\t") column += 4 - (column % 4);
    else break;
  }
  return column;
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
