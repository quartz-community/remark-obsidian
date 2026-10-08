import type { Root, RootContent } from "mdast";

import { shiftByMap, type LineMap } from "./line-map.js";

/** An opening fence is `---` and optional trailing spaces, then the line ending. */
const OPEN_FENCE = /^---[ \t]*$/u;

/**
 * Re-parse a document whose frontmatter fence never closes.
 *
 * `micromark-extension-frontmatter`'s construct is `concrete`, and when it opens on
 * line one but finds no closing fence it degrades every container in the rest of the
 * document: `---` / `1. x` arrives as a thematic break plus a *paragraph*, and so does
 * `---` / `> q`. A heading survives, which is what makes it look like a narrow problem
 * when it is not -- the damage reaches every later block, so `---` / `1. x` / `- y` / ``
 * / `- z` loses the list on line five as well as the one on line two.
 *
 * Obsidian reads a lone `---` as a thematic break and the rest as ordinary Markdown,
 * which is also what remark does with the extension removed. Reproduced with no
 * remark-obsidian in the pipeline at all -- plain `remark-parse` plus
 * `micromark-extension-frontmatter` is enough -- so this repairs a dependency's output
 * rather than our own.
 *
 * The repair is one re-parse rather than a per-block patch, because the mis-parse is
 * not per-block. Everything after the fence line is parsed on its own and spliced back
 * with its real offsets, and the fence itself stays the thematic break the extension
 * already fell back to. Re-parsing is safe for a document that was never damaged: the
 * slice cannot open frontmatter itself, since the guard has already established that no
 * line after the first is a fence.
 */
export function frontmatterUnclosedTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  const lines = source.split("\n");
  const first = lines[0];
  if (first === undefined || !OPEN_FENCE.test(first)) return;

  // A closing fence anywhere below means the construct worked and there is nothing
  // to repair. `startsWith` rather than an exact match, because the extension accepts
  // a closer with a tail and `frontmatterTailTransform` owns that case.
  for (let index = 1; index < lines.length; index++) {
    if (lines[index]!.startsWith("---")) return;
  }

  // Only when the extension actually fell back to a thematic break. If the tree holds
  // a `yaml` node the construct succeeded by some route this guard did not predict,
  // and rewriting would discard it.
  const head = tree.children[0];
  if (head?.type !== "thematicBreak" || head.position?.start?.line !== 1)
    return;
  if (tree.children.length < 2) return;

  const rest = lines.slice(1).join("\n");
  if (rest.trim() === "") return;

  let offset = first.length + 1;
  const starts: number[] = [];
  const mapped: number[] = [];
  for (let index = 1; index < lines.length; index++) {
    starts.push(offset);
    mapped.push(index + 1);
    offset += lines[index]!.length + 1;
  }

  const map: LineMap = { text: rest, starts, lines: mapped };
  const parsed = reparse(rest);
  for (const child of parsed.children) shiftByMap(child, map, 0);

  tree.children = [head, ...(parsed.children as RootContent[])];
}
