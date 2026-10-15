import type { Root, RootContent } from "mdast";
import { mapLines, shiftByMap } from "./line-map.js";

interface Fence {
  readonly indent: number;
  readonly character: string;
  readonly run: number;
  readonly info: string;
}

/**
 * A fence opener or closer, read with a COUNTING LOOP rather than a pattern.
 *
 * `/^([ \t]*)(`{3,}|~{3,})(.*)$/` is a second-degree polynomial to the ReDoS lint and the lint
 * is right: `.` matches a backtick, so the run and the tail can consume the same characters.
 * Two earlier spellings were rejected for the same reason -- the other being
 * `[ \t]*(\S*)[ \t]*$`, where both whitespace runs overlap. This repo already counts instead of
 * matching in `definition-column.ts` and `comment-quote-extent.ts` for exactly this.
 */
function readFence(line: string): Fence | undefined {
  let at = 0;
  while (at < line.length && (line[at] === " " || line[at] === "\t")) at += 1;
  const character = line[at];
  if (character !== "`" && character !== "~") return undefined;
  let run = 0;
  while (line[at + run] === character) run += 1;
  if (run < 3) return undefined;
  return {
    indent: at,
    character,
    run,
    info: line.slice(at + run).trim(),
  };
}

/**
 * A fence inside a list item is closed by its matching INDENTED closer, not reopened by it.
 *
 * An item's fenced block breaks at a column-zero line here, because the item's continuation
 * wants indentation and fence content cannot be lazy. The matching closer below it then looks
 * like a fresh opener, so we build a second `code` node that runs to the end of the note and
 * swallows every reference under it. Obsidian closes the original fence and leaves the rest of
 * the document alone.
 *
 * Five probes against live 1.14.4, and the last two are the controls:
 *
 *     - a / ⟨2sp⟩~~~ / > q[^2] / ⟨2sp⟩~~~ / blank / use[^1]   list@0-3, ref 1@5:3
 *     - a / ⟨2sp⟩~~~ / plain   / ⟨2sp⟩~~~ / blank / use[^1]   list@0-3, ref 1@5:3
 *     - a / ⟨2sp⟩~~~ / ⟨2sp⟩plain / ⟨2sp⟩~~~ / blank / use    list@0-3, ref 1@5:3
 *     - a / ⟨2sp⟩~~~ / > q / blank / use[^1]                  list@0-2 -- unclosed, ends at
 *                                                             the blank, and we agree
 *     - a / ⟨2sp⟩~~~ / ~~~ / blank / use[^1]                  list@0-1, code@2-5 -- a
 *                                                             COLUMN-ZERO fence really does
 *                                                             open a new block, and we agree
 *
 * So the closer has to be INDENTED to count, which is what separates this from the case we
 * already get right, and a column-zero quote line inside the fence does not break it.
 *
 * The repair is deliberately the smallest one that is true: the closer's line is given back to
 * the item's own `code` node, and only the REMAINDER is re-parsed. That remainder is a
 * root-level region with no enclosing container, which is the safe kind -- these notes record a
 * repair that re-parsed an item's CONTENT costing 27 referee documents, because the node it
 * produced competed with every block enclosing it.
 *
 * Only `position` moves, never the `code` node's value: a closed fence's SPAN includes its
 * closer and its CONTENT does not, so the value the tokenizer already built is already right.
 */
export function itemFenceCloserTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  for (let index = tree.children.length - 1; index >= 1; index--) {
    const tail = tree.children[index];
    if (tail?.type !== "code") continue;
    const from = tail.position?.start?.offset;
    const to = tail.position?.end?.offset;
    const startLine = tail.position?.start?.line;
    if (from === undefined || to === undefined || startLine === undefined) {
      continue;
    }

    // Its first line must be an INDENTED fence. A column-zero one opens a real block, which
    // the fifth probe confirms and which this must not touch.
    //
    // Sliced from the LINE START, not from the node's own offset: a `code` node begins at its
    // fence character, so slicing from `from` reports an indent of zero for every fence and the
    // indent test rejected them all. Found by tracing rather than by reading -- the condition
    // and the data were each plausible alone.
    const bol = source.lastIndexOf("\n", from - 1) + 1;
    const lineEnd = source.indexOf("\n", from);
    const bound = lineEnd === -1 ? source.length : lineEnd;
    const closer = readFence(source.slice(bol, bound));
    if (!closer || closer.indent === 0 || closer.info !== "") continue;

    // The previous sibling must be a list whose last item ends in an UNCLOSED fence opened with
    // the same character and no longer a run.
    const host = tree.children[index - 1];
    if (host?.type !== "list") continue;
    const item = host.children[host.children.length - 1];
    if (item?.type !== "listItem") continue;
    const inner = item.children[item.children.length - 1];
    if (inner?.type !== "code") continue;
    const innerFrom = inner.position?.start?.offset;
    if (innerFrom === undefined) continue;
    const innerBol = source.lastIndexOf("\n", innerFrom - 1) + 1;
    const innerEnd = source.indexOf("\n", innerFrom);
    const opener = readFence(
      source.slice(innerBol, innerEnd === -1 ? source.length : innerEnd),
    );
    if (!opener) continue;
    if (opener.character !== closer.character) continue;
    if (closer.run < opener.run) continue;

    // Give the closer's line to the item's code, and re-parse only what follows.
    const end = {
      line: startLine,
      column: bound - (source.lastIndexOf("\n", bound - 1) + 1) + 1,
      offset: bound,
    };
    for (const node of [inner, item, host]) {
      if (node.position) node.position.end = { ...end };
    }

    const rest = bound + 1;
    if (rest >= to) {
      tree.children.splice(index, 1);
      continue;
    }
    const map = mapLines(source, rest, to, startLine + 1);
    const parsed = reparse(map.text);
    for (const child of parsed.children) shiftByMap(child, map, 0);
    tree.children.splice(index, 1, ...(parsed.children as RootContent[]));
  }
}
