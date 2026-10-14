import type { Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { delimits } from "./table-pipe-style.js";

interface Point {
  line: number;
  column: number;
  offset?: number;
}

/**
 * The row's VERY FIRST character, so one leading space already means no pipe.
 *
 * This read `line.trimStart().startsWith("|")` -- the first NON-SPACE character -- which is
 * the reading their rules document records as superseded under C1: "the first-character test
 * replaced 'after any spaces' (45 notes of the run; family of 55)". `table-pipe-style.ts`
 * already carries the corrected form for the header and delimiter; this one governs BODY rows
 * and was never brought along, which an audit of their document is what surfaced.
 *
 * What it cost: in a PIPELESS table an indented body row reads as piped under the old test, so
 * it disagrees with the header and is dropped from the table --
 * `a | b` / `--- | ---` / `⟨2sp⟩| c[^2] | d` lost its row and the reference in it died, where
 * Obsidian keeps both. Stock micromark keeps the row too, so our tree disagreed with UPSTREAM
 * as well as with Obsidian, and C2 says why: a pipeless row is one that does not start with
 * `|` and holds one somewhere, which an indented line satisfies.
 */
const outerPiped = (line: string): boolean => line.startsWith("|");

/**
 * The character at a COLUMN, counting a tab to the next four-column stop.
 *
 * Indexing the string directly is wrong wherever a tab is involved, which B2 states
 * ("a tab in the indentation is consumed whole") and one referee document proves:
 * `+ | More [^名] | b |` / `⟨2sp⟩| --- | --- |` / `⇥| [^note] | c |` has its content column
 * at 2, and the tab row's character at INDEX 2 is a space where its character at COLUMN 2 is
 * the pipe. Indexing cut that row off the table and lost the document.
 *
 * A tab that straddles the target column therefore lands past it, and the content begins at
 * the next character -- which is what "consumed whole" means.
 */
function charAtColumn(line: string, target: number): string | undefined {
  let column = 0;
  for (let index = 0; index < line.length; index++) {
    if (column >= target) return line[index];
    column += line[index] === "\t" ? 4 - (column % 4) : 1;
  }
  return undefined;
}

function shift(node: unknown, offset: number, line: number): void {
  const candidate = node as {
    position?: { start: Point; end: Point };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.offset = offset + (point.offset ?? 0);
      point.line = line + point.line - 1;
    }
  }
  for (const child of candidate.children ?? []) shift(child, offset, line);
}

/**
 * A body row has to carry outer pipes if the header did.
 *
 * GFM lets every row choose independently, so `| a | b |` over `| --- | --- |`
 * keeps reading `c | d` as a row. Obsidian ends the table there and reads the
 * rest as prose — visibly, since the pipe then shows up in the text.
 *
 * This is not `remark-parse@8`'s rule either. Measured against the legacy stack,
 * it makes `c | d` a row like GFM does, so unlike emphasis, highlight and link
 * reference definitions there is no tokenizer to port here: Obsidian's table
 * handling is its own, and the rule is derived from the recorded output.
 */
export function tableRowStyleTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const table = parent.children[index];
      if (table?.type !== "table") continue;

      const start = table.position?.start?.offset;
      const end = table.position?.end?.offset;
      const startLine = table.position?.start?.line;
      if (start === undefined || end === undefined || startLine === undefined) {
        continue;
      }

      const lines = source.slice(start, end).split("\n");
      const header = lines[0];
      if (header === undefined || lines.length < 3) continue;

      // The table's own start COLUMN, which is where every later line's content begins.
      //
      // `lines[0]` is sliced from the table's start, so it carries no container prefix at
      // all, while every later line still has its full indentation -- `- a` / blank /
      // `⟨2sp⟩|b|` / `⟨2sp⟩|---|` gives `["|b|", "  |---|", "  |c|"]`. The old `trimStart()`
      // hid that asymmetry by stripping indentation everywhere, and testing the raw first
      // character instead exposed it: the header read as piped and every body row as not,
      // which cost `table/list-container` and two referee documents.
      //
      // C5 is the rule: "in a quote or a list item, a row's first character is the one after
      // the quote marker or at the item's content column". So a later line is measured at
      // `column`, and an extra space BEYOND it is a real indent that means no pipe. At root
      // the column is 0 and this reduces to the first character, which is C1.
      const bol = source.lastIndexOf("\n", start - 1) + 1;
      const column = start - bol;
      const pipedAt = (line: string, index: number): boolean =>
        index === 0 ? outerPiped(line) : charAtColumn(line, column) === "|";

      let cut = -1;
      for (let line = 2; line < lines.length; line++) {
        // Two ways a body row ends the table: it disagrees with the header on
        // the outer pipes, or it delimits no cells at all. The second is the
        // same rule the header and delimiter rows obey -- a leading pipe alone
        // separates nothing -- so `| a |` / `| --- |` / `| b` is a table plus a
        // paragraph.
        if (
          pipedAt(lines[line]!, line) !== pipedAt(header, 0) ||
          !delimits(lines[line]!)
        ) {
          cut = line;
          break;
        }
      }
      if (cut === -1) continue;

      const head = lines.slice(0, cut).join("\n");
      const tail = lines.slice(cut).join("\n");
      const parsedHead = reparse(head);
      const parsedTail = reparse(tail);
      if (parsedHead.children.length === 0) continue;
      if (parsedHead.children[0]?.type !== "table") continue;

      for (const child of parsedHead.children) shift(child, start, startLine);
      const tailOffset = start + head.length + 1;
      for (const child of parsedTail.children) {
        shift(child, tailOffset, startLine + cut);
      }

      parent.children.splice(
        index,
        1,
        ...(parsedHead.children as RootContent[]),
        ...(parsedTail.children as RootContent[]),
      );
      index += parsedHead.children.length + parsedTail.children.length - 1;
    }
  });
}
