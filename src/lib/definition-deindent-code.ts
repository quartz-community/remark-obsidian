import type { Root, RootContent } from "mdast";
import type { ListItem } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { contentColumn } from "./definition-column.js";

/**
 * B3's other half: the de-indentation minimum moves where indented CODE begins.
 *
 * `definition-column.ts` lowers an item's content column to the smallest indentation among its
 * own indented lines. That same column is what indented code is measured from, so a definition
 * four or more past it is code and Obsidian reports no definition at all:
 *
 *     - a / ⟨1sp⟩b / blank / ⟨4sp⟩[^1]: x    floor 1, 4 - 1 = 3    definition at column 1
 *     - a / ⟨1sp⟩b / blank / ⟨5sp⟩[^1]: x    floor 1, 5 - 1 = 4    CODE, no definition
 *
 * The four `probe/def-deindent/code-*` corpus cases are the sibling project's own `probe:k-*`
 * documents, which its recorded oracle answers `defs: []` for, and the referee holds them too.
 *
 * THE UNIT IS CHARACTERS, A TAB COUNTING ONE, and a tab that follows a space ending the count.
 * Both halves are measured against live 1.14.4 rather than reasoned about, and each cost a
 * scoring run to find:
 *
 *     - a / ⟨4sp⟩- b / ⇥⇥- [^1]: def      column 4, so `⇥⇥` is TWO and not eight.
 *                                         Expanding leading tabs here scored 18/7 against 16/1.
 *     - p / blank / ⟨5sp⟩⇥[^1]: def       column 2, so the tab after five spaces adds NOTHING --
 *                                         the arbiter rule `definition-column.ts` carries, that
 *                                         a leading tab reaches the threshold and one after a
 *                                         space does not.
 *
 * Scored before building, four ways, and the progression is the evidence:
 *
 *     indent in expanded columns              better 20  worse 17  agreement -12
 *     indent in characters                    better 17  worse  4  agreement  +1
 *     ...leading tabs expanded                better 18  worse  7  agreement  -2
 *     ...tab-after-space ends the count       better 16  worse  1  agreement  +4
 *
 * THE EXTENT IS MICROMARK'S. The definition's lines are re-parsed with the host's content
 * column stripped, so what remains is four or more past zero and the tokenizer makes it code,
 * deciding the interior blank line and the lazy split itself. Hand-rolling that is what
 * `definition-indented-code.ts` records as the thing a re-parse exists to delegate.
 *
 * THE CHARACTER COUNT IS NOT THE WHOLE RULE, and the INVERSE pass built on it is reverted.
 * This one is conservative -- it only ever ADDS code -- so a character count that understates
 * the indent costs nothing here. Read as a complete account of the threshold it is wrong, and
 * a pass that frees code wherever the characters fall short measured referee -15 (14 gained,
 * 27 lost) in one chain position and -21 in another, breaking `commonmark/tabs/5` in both.
 *
 * That case is what explains it. `- foo` / blank / `⇥⇥bar` is two characters and eight
 * columns, and it IS code; `- parent` / blank / `⇥⟨3sp⟩[^3]: It` is four characters and seven
 * columns, and it is NOT. Characters are LOWER for the case that is code, so they cannot be
 * the discriminator. Seven probes give the rule that fits every one:
 *
 *     ⟨4sp⟩  4 columns   defines        ⇥        4 columns   defines
 *     ⟨5sp⟩  5 columns   defines        ⇥⟨3sp⟩   7 columns   defines
 *     ⟨6sp⟩  6 columns   CODE           ⇥⟨4sp⟩   8 columns   CODE
 *                                       ⇥⇥       8 columns   CODE
 *
 * The threshold is SIX for a space-only run and EIGHT once a tab leads -- and eight is the
 * tab stop plus four. So **a leading tab resets the content column to its own tab stop**,
 * where a space run leaves the item's content column of 2 in place. Both thresholds are then
 * the same rule, `contentColumn + 4`, over two different content columns.
 *
 * THE TOKENIZER ROUTE WAS BUILT AND REVERTED, and it is the most informative of the three
 * attempts because it WORKED on the rule and failed on the cascade.
 *
 * `tokenizeIndent` returns a state, so the first code of the line is available and the
 * `factorySpace` limit can be chosen per line -- `max(size, 4) + 1` when a tab leads, `size + 1`
 * otherwise -- with `afterPrefix` accepting `got === 4` for a tab-led run. That is the rule
 * exactly, and it makes ALL SEVEN `probe/item-tab-threshold/*` cases match, including
 * `tab-three`, which no repair pass ever did.
 *
 *     referee footnotes  5745 -> 5754   32 gained, 23 lost
 *     referee code        742 ->  735   -7
 *     corpus 0 regressions, compose 0 of 256
 *
 * So the rule is confirmed and the IMPLEMENTATION cascades. An item's content column decides
 * what the item OWNS, not only where its code begins, so moving it moves definition end lines
 * and invents definitions elsewhere -- `["टिप्पणी",11,4,13]` becomes `...,12`, and one document
 * gains `[["b",3,1,3]]` where the oracle has nothing. 32 against 23 is a worse ratio than the
 * 21-against-10 that `definition-math-absorb.ts` shipped on, and the code dimension loses seven
 * with no compensating gain.
 *
 * Reverted on that arithmetic rather than on principle. What it establishes is that the route
 * is reachable and the rule is right: a narrowing that moves the CODE THRESHOLD without moving
 * OWNERSHIP would collect the +9 without the cascade, and in a container tokenizer those are
 * currently the same decision.
 *
 * The placement note below was the first answer written here and it was WRONG.
 * `deIndentFloor` cannot own this: it computes a DEFINITION's column, and by the time it runs
 * the tokenizer has already decided the line is code. `contentColumn` beside it does handle a
 * tab -- `+⇥⟨4sp⟩Text` gives column 4 -- but only in the MARKER's separator, never a tab
 * leading a continuation line.
 *
 * The decision is in `legacy-list.ts`'s `tokenizeIndent`, which calls `factorySpace` with a
 * limit of `containerState.size + 1` and then accepts only `got === size`, where `got` is
 * `sliceSerialize(token, true)` -- expanded, so COLUMNS. For `- parent` with size 2 and a
 * `⇥⟨3sp⟩` line, the container takes 2 of 7 columns and the 5 left over are code; the rule
 * wants it to take 4, leaving 3. The same change gives `⇥⇥` 8 - 4 = 4 and keeps it code, which
 * is what `commonmark/tabs/5` asserts.
 *
 * So a fix raises that limit to `max(size, 4) + 1` for a tab-led run and widens the `got`
 * test to match. Stated rather than attempted, with its risk: the limit is chosen BEFORE the
 * line is seen, so the widening cannot be conditioned on the leading character and would reach
 * every item whose size is under 4 -- which is most of them. That is the shape of the work and
 * the reason it is not a small change.
 */
export function definitionDeindentCodeTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  // The INNERMOST enclosing item owns the column, which is the map `definition-column.ts`
  // builds for the same reason: `visit` is pre-order, so overwriting keeps the inner item.
  const items = new Map<Node, ListItem>();
  visit(tree, "listItem", (item: Node) => {
    visit(item, (inner: Node) => {
      items.set(inner, item as ListItem);
    });
  });

  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const block = parent.children[index];
      if (
        block?.type !== "footnoteDefinition" &&
        block?.type !== "definition"
      ) {
        continue;
      }
      const host = items.get(block as Node);
      if (!host) continue;
      const column = contentColumn(source, host);
      if (column === undefined) continue;

      const to = block.position?.end?.offset;
      const startLine = block.position?.start?.line;
      const from = block.position?.start?.offset;
      if (from === undefined || to === undefined || startLine === undefined) {
        continue;
      }

      const bol = source.lastIndexOf("\n", from - 1) + 1;
      const head = source.slice(
        bol,
        source.indexOf("\n", bol) + 1 || undefined,
      );
      const run = head.slice(0, head.length - head.trimStart().length);
      let indent = 0;
      let sawSpace = false;
      for (const character of run) {
        if (character === "\t" && sawSpace) break;
        if (character === " ") sawSpace = true;
        indent += 1;
      }
      if (indent < column + 4) continue;

      // Strip exactly the host's content column from every line, keeping where each line really
      // began so the re-parsed fragment can be placed back. `mapLines` strips a QUOTE prefix,
      // which is a different quantity, so the map is built here.
      const raw = source.slice(bol, to).split("\n");
      const text: string[] = [];
      const starts: number[] = [];
      const lines: number[] = [];
      let offset = bol;
      for (const [at, line] of raw.entries()) {
        let strip = 0;
        while (strip < column && /[ \t]/u.test(line[strip] ?? "")) strip += 1;
        starts.push(offset + strip);
        lines.push(startLine + at);
        text.push(line.slice(strip));
        offset += line.length + 1;
      }

      const parsed = reparse(text.join("\n"));
      if (parsed.children.length === 0) continue;
      // Only when the tokenizer agrees it is code. A definition whose indentation survives the
      // strip for some other reason must be left exactly as it was.
      if (parsed.children[0]?.type !== "code") continue;

      for (const child of parsed.children) {
        shiftByLines(child, starts, lines);
      }
      parent.children.splice(index, 1, ...(parsed.children as RootContent[]));
      index += parsed.children.length - 1;
    }
  });
}

interface Point {
  line: number;
  column: number;
  offset?: number;
}

/** Place a fragment parsed from the stripped text back onto the document. */
function shiftByLines(
  node: unknown,
  starts: readonly number[],
  lines: readonly number[],
): void {
  const candidate = node as {
    position?: { start: Point; end: Point };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      const at = point.line - 1;
      const lineStart = starts[at];
      const line = lines[at];
      if (lineStart !== undefined && line !== undefined) {
        point.offset = lineStart + point.column - 1;
        point.line = line;
      }
    }
  }
  for (const child of candidate.children ?? []) {
    shiftByLines(child, starts, lines);
  }
}
