import type { Root, RootContent } from "mdast";

import { mapLines, shiftByMap } from "./line-map.js";

/** A line that is blank, or indented far enough to be code. */
const indentedOrBlank = (line: string): boolean =>
  line.trim() === "" || /^(?: {4}|\t)/u.test(line);

/**
 * An indented line after a LINK reference definition is code, not a paragraph.
 *
 * A definition is a closed block, so nothing stops indented code from following it -- and
 * CommonMark's "indented code cannot interrupt a paragraph" rule does not apply, because a
 * definition is not a paragraph. Obsidian reads it that way and micromark does not:
 *
 *     [ref]: /url / `    code`          obs  definition@0, code@1      ours  paragraph@1
 *     [ref]: /url / `   code`           obs  definition@0, paragraph@1 -- three spaces
 *     para        / `    code`          obs  paragraph@0 alone -- absorbed, correct
 *
 * UPSTREAM, measured: bare `remark-parse` + `remark-gfm` reports the same paragraph, so no
 * pass here introduces it.
 *
 * ONLY where the continuation attempt FAILED, which is the whole scope. A definition's
 * destination and title may legitimately sit on indented continuation lines, and micromark
 * gets those right -- `[ref]:` / `    /url` and `[ref]: /url` / `    'title'` both report one
 * `definition` spanning both lines on BOTH sides. What is left over when no title can be read
 * is what micromark mis-files as a paragraph. So this only ever sees a paragraph that
 * micromark already declined to absorb.
 *
 * AND ONLY A LINK DEFINITION, never a `footnoteDefinition`. That distinction is the one the
 * corpus insisted on before a line was written: 42 cases have a footnote definition followed
 * by an indented line, where the line is the definition's own CONTENT and we already match.
 * Exactly ONE has a link definition followed by one, `commonmark/link-reference-definitions/193`,
 * and that is a continuation case this pass must not touch -- its definition absorbs all
 * three lines, so no paragraph follows it and the guard below never fires.
 *
 * The extent is micromark's rather than hand-rolled. Re-parsing the indented run IN ISOLATION
 * gives Obsidian's answer on every shape probed, because out of context the indented line is
 * interrupting nothing:
 *
 *     `    code`                     code@0
 *     `    one` / `    two`          code@0-1
 *     `    code` / `lazy`            code@0, paragraph@1   -- the split, for free
 *     `    code` / blank / `    more`  code@0-2            -- blank absorbed, for free
 *
 * Hand-rolling any of that would have meant reimplementing indented-code extent, including
 * the interior blank line and the lazy split, which is exactly what the re-parse delegates.
 */
export function definitionIndentedCodeTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  const lineStarts: number[] = [0];
  for (let at = 0; at < source.length; at++) {
    if (source[at] === "\n") lineStarts.push(at + 1);
  }
  const lineAt = (offset: number): number => {
    let line = 0;
    for (let at = 0; at < lineStarts.length; at++) {
      if (lineStarts[at]! <= offset) line = at;
      else break;
    }
    return line;
  };
  const lines = source.split("\n");

  for (let index = tree.children.length - 2; index >= 0; index--) {
    if (tree.children[index]?.type !== "definition") continue;
    const next = tree.children[index + 1];
    if (next?.type !== "paragraph") continue;

    const from = next.position?.start?.offset;
    const definitionEnd = tree.children[index]!.position?.end?.offset;
    if (from === undefined || definitionEnd === undefined) continue;
    // Directly after, with nothing but one line ending between them. A blank line in between
    // would make the code block its own thing rather than this defect.
    if (source.slice(definitionEnd, from).trim() !== "") continue;

    const firstLine = lineAt(from);
    if (!/^(?: {4}|\t)/u.test(lines[firstLine] ?? "")) continue;

    // Every following line that is indented or blank, trailing blanks dropped -- the region
    // micromark would read as one code block.
    let last = firstLine;
    for (let line = firstLine; line < lines.length; line++) {
      if (!indentedOrBlank(lines[line] ?? "")) break;
      if ((lines[line] ?? "").trim() !== "") last = line;
    }

    const runEnd = lineStarts[last]! + (lines[last] ?? "").length;

    // The region has to cover every node it TOUCHES, not merely the indented run, or
    // replacing it drops whatever that node held past the run. `[ref]: /url` / `    code` /
    // `lazy` arrives as ONE paragraph spanning both lines while the run is only the first,
    // so splicing the run's re-parse over it deleted `lazy` outright. Found by probing the
    // extents rather than by a gate: a lost line is not something this case's compose row
    // can see, because the row was already red for the node type.
    //
    // Extending rather than narrowing is what keeps the re-parse honest -- micromark reads
    // `    code` / `lazy` in isolation as `code` plus `paragraph`, which is Obsidian's own
    // answer, so handing it the whole touched span lets it do the split itself.
    let span = 0;
    let regionEnd = runEnd;
    while (index + 1 + span < tree.children.length) {
      const node = tree.children[index + 1 + span]!;
      if ((node.position?.start?.offset ?? Infinity) >= runEnd) break;
      regionEnd = Math.max(regionEnd, node.position?.end?.offset ?? runEnd);
      span++;
    }
    if (span === 0) continue;

    const map = mapLines(
      source,
      lineStarts[firstLine]!,
      regionEnd,
      firstLine + 1,
    );
    const parsed = reparse(map.text);
    if (parsed.children.length === 0) continue;
    for (const child of parsed.children) shiftByMap(child, map, 0);

    tree.children.splice(
      index + 1,
      span,
      ...(parsed.children as RootContent[]),
    );
  }
}
