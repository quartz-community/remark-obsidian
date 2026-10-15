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
