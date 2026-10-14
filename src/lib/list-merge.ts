import type { List, Root } from "mdast";

/** A bullet marker, or an ordered marker's delimiter. Two lists continue only if it matches. */
const BULLET = /^[ \t]*([-*+])/u;
const ORDERED = /^[ \t]*\d{1,9}([.)])/u;

/**
 * Two adjacent lists with no blank line between them are ONE list.
 *
 * Their rules document's B10, and live 1.14.4 agrees: a label between two items with no blank
 * line is the first item's LAZY TEXT, so the list never ended and the next marker is simply
 * its next item.
 *
 *     - apples / [^1]: x / - pears        obs list@0-2, 2 items     was two lists
 *     1. apples / [^1]: x / 2. pears      obs list@0-2, 2 items     was two lists
 *     - apples / [^1]: x / - pears / - plums   obs list@0-3, 3 items    was two lists
 *
 * Plain lazy text already merged -- `- apples` / `lazy text` / `- pears` is one list here
 * without this pass, because micromark never closed the list. The definition case differs
 * only in that the definition arrives as its own root block and `containerLazyTransform`
 * absorbs it afterwards, by which point micromark has already closed the list and opened a
 * second one. So this pass repairs an adjacency that the absorption creates.
 *
 * THE MARKER HAS TO MATCH, which is what keeps it from over-firing. Measured, each against
 * the running app:
 *
 *     - apples / [^1]: x / * pears        TWO lists    a different bullet starts a new list
 *     - apples / [^1]: x / 1. pears       TWO lists    bullet against ordered
 *     - apples / blank / [^1]: x / blank / - pears   THREE blocks, a REAL definition between
 *
 * The last is why the gap test is exact rather than trimmed: a blank line means the label is
 * a definition of its own and the lists genuinely are apart, which is B9's other half --
 * "anything else between them, a footnote definition included, keeps them apart".
 */
export function listMergeTransform(tree: Root, source: string): void {
  if (source === "") return;

  const children = tree.children;
  for (let index = children.length - 2; index >= 0; index--) {
    const first = children[index];
    const second = children[index + 1];
    if (first?.type !== "list" || second?.type !== "list") continue;
    if (first.ordered !== second.ordered) continue;

    const to = first.position?.end?.offset;
    const from = second.position?.start?.offset;
    if (to === undefined || from === undefined) continue;
    // Exactly one line ending. A blank line makes the label between them a definition of its
    // own, and then the two lists really are separate blocks.
    if (source.slice(to, from) !== "\n") continue;

    if (markerOf(first, source) !== markerOf(second, source)) continue;

    (first.children as unknown[]).push(...second.children);
    if (first.position && second.position?.end) {
      first.position.end = { ...second.position.end };
    }
    // A list holding a loose item is loose throughout, which is B10's other half -- the
    // blank line that makes `li > p` renders every item that way. Merging a loose list into
    // a tight one has to carry that across or the second half renders differently from how
    // it did alone.
    if (second.spread) first.spread = true;
    children.splice(index + 1, 1);
  }
}

/** A list's marker: the bullet character, or an ordered marker's `.`/`)` delimiter. */
function markerOf(list: List, source: string): string | undefined {
  const from = list.children[0]?.position?.start?.offset;
  if (from === undefined) return undefined;
  const bol = source.lastIndexOf("\n", from - 1) + 1;
  const nl = source.indexOf("\n", from);
  const line = source.slice(bol, nl === -1 ? undefined : nl);
  const match = list.ordered ? ORDERED.exec(line) : BULLET.exec(line);
  return match?.[1];
}
