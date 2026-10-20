import type { Code, ListItem, Root, RootContent } from "mdast";
import { contentColumn } from "./definition-column.js";
import { columnsOf } from "./item-dot-threshold.js";
import type { Node } from "unist";

const QUOTED = /^[ \t]*>/u;
const INDENTED = /^(?: {4}|\t)/u;
const QUOTES = new Set(["blockquote", "callout"]);

/**
 * A line that OPENS A BLOCK, which is what a list item requires and a quote does not.
 *
 * The two hosts differ, measured eight followers each under `> Text` and `*⟨4sp⟩Text`:
 *
 *     under a QUOTE   fence, plain, heading, comment, thematic, marker, label  ALL code
 *                     a quoted `>` line                                       continues
 *     under an ITEM   fence, heading, comment, marker                          code
 *                     plain, `>`, `---`, `[^1]:`                               absorbed
 *
 * So a quote releases any lazy indented line, while an item releases only one that would
 * start a block -- everything else is lazy continuation of the item's own paragraph. Each
 * boundary is the construct's own validity rule, from seventeen further probes: a SAME marker
 * continues the list, `#tag` and seven hashes are not ATX, `--` is not a marker, two
 * backticks are not a fence and a single `%` is not a comment. `---` is absent because a
 * thematic break reads as a setext underline, the asymmetry `legacy-list.ts` records as "only
 * a marker with a second reading loses".
 */
const OPENS_BLOCK =
  /^(?:```|~~~|#{1,6}(?:[ \t]|$)|%%|(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$))/u;

/**
 * A LAZY line indented four columns under a ROOT quote is root indented code.
 *
 * Found by `compose.mts --lazy`, the axis built for partially-prefixed container bodies --
 * the shape no other axis can generate, since `--inside` prefixes every line of its inner
 * block. 16 of its 512 cells diverged and all 16 were this.
 *
 * THE PREDICATE IS `/^(?: {4}|\t)/`, measured rather than assumed. Eighteen follower indents
 * asked of the live app under an open quote:
 *
 *     0-3sp    not code        4sp..8sp      CODE        tabtab  CODE
 *     tab      CODE            tab+1..4sp    CODE
 *     1sp+tab / 2sp+tab / 3sp+tab            NOT code
 *
 * Four spaces OR a leading tab reproduces all eighteen. The space-then-tab rows are the
 * asymmetry `definition-indented-code.ts` carries the same pattern for -- a tab AFTER a space
 * reaches nothing at an indent threshold -- so the predicate is derived twice, independently,
 * from two oracles.
 *
 * ROOT QUOTES ONLY, which is a restriction from the construct and not a fit to the losses:
 *
 *     quote at column 0              indent 0..12   ....CCCCCCCCC
 *     quote at column 2, in an item                 .............
 *     quote at column 4, in a definition            .............
 *
 * A nested quote produces NO root code at any indent, because its lazy line belongs to the
 * container above it and there is no root block for the line to become. Adding that
 * restriction moved the score from 35/7 to 34/5 and raised BOTH counters, which is the shape
 * a correct restriction has -- one gain traded for two losses removed.
 *
 * AND THE QUOTE'S LAST CHILD IS IRRELEVANT, which is worth stating because the remaining
 * losses suggested otherwise. A definition, a link definition, a fence and a comment all
 * produce code on the indented lazy line, eight shapes for eight:
 *
 *     "> [^2]: def" / "⟨5sp⟩continued"      code@1-1, and the definition does NOT continue
 *     "> ```"       / "⟨5sp⟩continued"      code@1-1
 *
 * So there is no definition-continuation exception to carve out, and the five documents this
 * still loses are not that family.
 *
 * `score.mts` scored it `better 34 / worse 5 / same 5` for +9 agreeing documents and referee
 * +2 before any of this was built.
 */
export function quoteLazyIndentedCodeTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  const lines = source.split("\n");
  const indentOf = (text: string): string => /^[ \t]*/u.exec(text)![0];
  /** A bullet's own character, or an ordered item's delimiter -- the thing that must match. */
  const markerOf = (text: string): string | undefined =>
    /^[ \t]*(?:([-*+])|\d{1,9}([.)]))[ \t]/u.exec(text)?.slice(1).find(Boolean);
  const starts: number[] = [];
  let at = 0;
  for (const line of lines) {
    starts.push(at);
    at += line.length + 1;
  }

  const lazyRun = (
    from: number,
    to: number,
    releases: (text: string) => boolean,
  ): [number, number] | undefined => {
    let first = -1;
    for (let line = from + 1; line <= to; line++) {
      const text = lines[line] ?? "";
      if (text.trim() === "") continue;
      if (!releases(text)) continue;
      first = line;
      break;
    }
    if (first < 0) return undefined;
    let last = first;
    while (last + 1 <= to) {
      const text = lines[last + 1] ?? "";
      if (text.trim() === "" || !releases(text)) break;
      last += 1;
    }
    return [first, last];
  };

  const quoteReleases = (text: string): boolean =>
    !QUOTED.test(text) && INDENTED.test(text);

  /**
   * An item releases a line only BELOW its content column and only if it opens a block.
   *
   * `contentColumn` is called rather than re-derived: it carries the five-space cap and the
   * bare-marker width branch, and this package records a candidate refuted by its own
   * re-derivation of exactly this quantity.
   */
  const itemReleases =
    (markerLine: number) =>
    (text: string): boolean => {
      if (!INDENTED.test(text)) return false;
      const bare = text.replace(/^[ \t]+/u, "");
      if (!OPENS_BLOCK.test(bare)) return false;
      // THE SAME MARKER CONTINUES THE LIST, and dropping this test is what broke
      // `commonmark/lists/312` and `313` -- the staircase examples, where `⟨4sp⟩- e` under
      // `⟨3sp⟩- d` and `⟨4sp⟩3. c` under `⟨2sp⟩2. b` are further ITEMS and not code. The
      // tokenizer sketch of this rule compared `containerState.marker` and the first
      // regex-only version of it here lost that, which the gate caught on the two cases
      // CommonMark ships for exactly this shape.
      const mine = markerOf(bare);
      if (mine !== undefined && mine === markerOf(lines[markerLine] ?? "")) {
        return false;
      }
      const column = contentColumn(source, {
        position: { start: { offset: starts[markerLine]! } },
      } as unknown as ListItem);
      return column !== undefined && columnsOf(indentOf(text)) < column;
    };

  /**
   * The same release, for an ordered list BELOW A QUOTE whose start is not 1.
   *
   * `2.`, `10.` and `2)` cannot interrupt a paragraph, so below a quote they are not a list at
   * all -- the line is lazy continuation, and an indented line beneath it falls to ROOT code.
   * `container-lazy.ts` already carries that reasoning for a callout host; this is the same rule
   * with a quote host, which is the input class it was never scoped for.
   *
   * Measured against live Obsidian, `>` / `<marker>` / `<5sp>Some`:
   *
   *     1.  []          2.  code@2      -  []
   *     1)  []          2)  code@2      *  []
   *                     10. code@2      +  []
   *
   * So the discriminator is `start !== 1` and not the marker's width, and a bullet never
   * releases however wide it is. A non-empty quote behaves identically to an empty one, and a
   * blank line in place of the quote releases NOTHING -- the quote is required.
   *
   * Neither of `itemReleases`'s own guards can express this: a plain prose line opens no block,
   * and the content column of a bare `10.` is 3 while the released line sits at 5, so the
   * below-the-column test refuses it too. Relaxing either would break what they were measured
   * for, so this is a separate predicate rather than a widening. The same-marker guard IS kept,
   * because CommonMark's staircase cases depend on it.
   */
  const itemReleasesBelowQuote =
    (markerLine: number) =>
    (text: string): boolean => {
      if (!INDENTED.test(text)) return false;
      const bare = text.replace(/^[ \t]+/u, "");
      const mine = markerOf(bare);
      if (mine !== undefined && mine === markerOf(lines[markerLine] ?? "")) {
        return false;
      }
      // STRICTLY DEEPER than the item's content column, which is the INVERSE of the test
      // `itemReleases` applies. That pass handles a line too SHALLOW to belong to the item; this
      // one handles a line too DEEP, which becomes indented code -- and because the item is
      // lazy continuation rather than a real list, the code lands at ROOT.
      //
      // Derived from the five documents the unguarded version cost, which all have the line at
      // or below the content column and no code in Obsidian at all:
      //
      //     "10." / "<5sp>Some"          column 3, indent 5   RELEASE   obs code@2
      //     "10.<5sp>Text" / "<4sp>[^N]" column 8, indent 4   no        obs []
      //     "10.<4sp>```" / "<5sp>It"    column 7, indent 5   no        obs []
      //     "10.<TAB>> [!tip]" / "<4sp>>" column 4, indent 4  no        obs []
      //
      // The last is why the comparison is STRICT: an equal indent is the item's own content.
      const column = contentColumn(source, {
        position: { start: { offset: starts[markerLine]! } },
      } as unknown as ListItem);
      return column !== undefined && columnsOf(indentOf(text)) > column;
    };

  // Walked to ANY DEPTH with the parent in hand, because lazy continuation can bury a
  // column-0 quote inside another container -- the root-only scan is what left the first
  // version of `quoted-fence-lazy.ts` completely inert.
  const walk = (parent: { children?: RootContent[] }): void => {
    const children = parent.children;
    if (!Array.isArray(children)) return;
    for (let index = children.length - 1; index >= 0; index--) {
      const node = children[index];
      if (!node) continue;
      walk(node as unknown as { children?: RootContent[] });
      // A root-level LIST, not the `listItem` inside it. The code node has to land at ROOT to
      // be a root code section at all, and splicing beside an item puts it inside the list --
      // which is what made the first version of this arm completely inert while every
      // predicate in it fired correctly.
      const isList = node.type === "list";
      if (!QUOTES.has(node.type) && !isList) continue;
      const position = node.position;
      if (!position || position.start.column !== 1) continue;

      // The LAST item's marker line, because that is the item a trailing lazy line is
      // measured against.
      const items = (node as unknown as { children?: RootContent[] }).children;
      const lastItem = isList ? items?.[items.length - 1] : undefined;
      const markerLine = lastItem?.position?.start?.line;
      if (isList && markerLine === undefined) continue;

      // A quote IMMEDIATELY above is what makes a non-1 ordered marker lazy continuation
      // rather than a list, so the predicate is chosen per host rather than per line.
      const previous = index > 0 ? children[index - 1] : undefined;
      const start = (node as unknown as { start?: number | null }).start;
      // ADJACENT, not merely the previous sibling: a blank line between the quote and the
      // marker closes the quote, so the marker opens a REAL list and nothing is released.
      // Measured, `>` over `10. [^a]: def` over `<6sp>%%`:
      //
      //     quote adjacent        code@2    def a@1-1
      //     quote, BLANK, marker  []        def a@2-3   -- the definition absorbs both lines
      //
      // The sibling test alone cannot see it, because a blank line is not a node. This is the
      // shape of both documents the previous attempt traded away, and `[^a]` ending at line 3
      // rather than 1 is the oracle saying the deeper lines are the DEFINITION's content.
      const belowQuote =
        isList &&
        typeof start === "number" &&
        start !== 1 &&
        previous !== undefined &&
        QUOTES.has(previous.type) &&
        previous.position?.end.line === markerLine! - 1;

      const run = lazyRun(
        position.start.line - 1,
        position.end.line - 1,
        isList
          ? belowQuote
            ? itemReleasesBelowQuote(markerLine! - 1)
            : itemReleases(markerLine! - 1)
          : quoteReleases,
      );
      if (!run) continue;
      const [first, last] = run;
      // CONTIGUOUS with the marker, for the below-quote arm only. Lazy continuation continues
      // the line above it, so a line that is not itself released breaks the chain -- and the
      // three documents this cost all have the same shape: `10.` then a COLUMN-0 definition
      // then the indented lines, where the list has already ended at the definition and the
      // indented lines are its continuation. Obsidian reports `code: []` for all three. Every
      // probe that established the rule had the released line at marker + 1.
      if (belowQuote && first !== markerLine!) continue;
      const quoteEnd = position.end.line - 1;

      const code: Code = {
        type: "code",
        lang: null,
        meta: null,
        value: lines
          .slice(first, last + 1)
          .map((line) => line.replace(INDENTED, ""))
          .join("\n"),
        position: {
          start: { line: first + 1, column: 1, offset: starts[first]! },
          end: {
            line: last + 1,
            column: (lines[last]?.length ?? 0) + 1,
            offset: starts[last]! + (lines[last]?.length ?? 0),
          },
        },
      };

      // Everything the quote swallowed from the cut onward goes with it: the lines became
      // code, so a definition or reference standing on one of them is not indexed either.
      //
      // CLAMPED, not merely shrunk onto the last child. A child that STARTS before the cut
      // and ENDS after it -- the lazily-continued paragraph, which is the whole defect --
      // survives the drop and keeps its end past the cut, so pulling the quote back onto it
      // leaves the quote still covering the code node. That is 15 `SIBLINGS OVERLAP`
      // violations in `compose.test.ts`, which is the gate catching exactly what it is for.
      clamp(node, first, {
        line: first,
        column: (lines[first - 1]?.length ?? 0) + 1,
        offset: (starts[first - 1] ?? 0) + (lines[first - 1]?.length ?? 0),
      });

      // WHATEVER THE QUOTE HELD AFTER THE RUN IS RE-PARSED, NOT DROPPED. `> q` / `> - i` /
      // `⟨4sp⟩lazy` / `> after` is `blockquote, code, blockquote` to Obsidian -- the marked
      // line resumes a SECOND quote -- and the clamp above has just deleted it along with
      // everything else past the cut. Restricting the rule to a run that reaches the quote's
      // last line avoids the deletion and costs referee 5860 -> 5858 and code 775 -> 758, so
      // the tail has to be rebuilt rather than avoided.
      const tail: RootContent[] = [];
      if (last < quoteEnd) {
        const from = starts[last + 1]!;
        // To the QUOTE's end, not the document's: the quote's siblings were never touched,
        // and re-parsing past it would insert a second copy of the rest of the note.
        const to = starts[quoteEnd]! + (lines[quoteEnd]?.length ?? 0);
        const parsed = reparse(source.slice(from, to));
        for (const child of parsed.children) {
          shiftBy(child, from);
          tail.push(child);
        }
      }
      children.splice(index + 1, 0, code as RootContent, ...tail);
    }
  };
  walk(tree as unknown as { children?: RootContent[] });
}

interface Point {
  line: number;
  column: number;
  offset: number;
}

/**
 * Move a re-parsed subtree onto its real place in the document, by OFFSET only.
 *
 * `normalizePointsTransform` rebuilds every line and column from the offsets later, so
 * shifting those here would be work the chain undoes -- and these notes record offsets as the
 * thing that must be right before that pass runs.
 */
function shiftBy(node: unknown, offset: number): void {
  const self = node as {
    position?: { start: { offset?: number }; end: { offset?: number } };
    children?: unknown[];
  };
  if (self.position) {
    for (const point of [self.position.start, self.position.end]) {
      point.offset = offset + (point.offset ?? 0);
    }
  }
  for (const child of self.children ?? []) shiftBy(child, offset);
}

/**
 * Cut a subtree back so nothing in it reaches past `maxLine`, a ONE-BASED line number.
 *
 * A descendant starting past the line goes; one spanning it is trimmed, value included --
 * the lazily-continued paragraph still holds the code line's text, and leaving that behind
 * while moving its position is the mismatch these notes record as the wrong source for a
 * value. The line count is what gets dropped, not a re-slice of the source, because the
 * value is what the tokenizer resolved and a slice is what the author typed.
 */
function clamp(node: Node, maxLine: number, fallback: Point): void {
  const self = node as unknown as { children?: RootContent[]; value?: unknown };
  const children = self.children;

  if (Array.isArray(children)) {
    for (let index = children.length - 1; index >= 0; index--) {
      const child = children[index]!;
      const start = child.position?.start?.line;
      if (start !== undefined && start > maxLine) {
        children.splice(index, 1);
        continue;
      }
      clamp(child, maxLine, fallback);
    }
    const last = children[children.length - 1];
    if (node.position && last?.position?.end) {
      node.position.end = { ...last.position.end };
      return;
    }
  }

  const end = node.position?.end;
  if (!end || end.line <= maxLine) return;
  if (typeof self.value === "string") {
    const keep = self.value.split("\n").length - (end.line - maxLine);
    self.value = self.value.split("\n").slice(0, Math.max(1, keep)).join("\n");
  }
  node.position!.end = { ...fallback };
}
