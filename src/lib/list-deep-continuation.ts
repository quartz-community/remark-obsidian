import type { List, ListItem, Root, RootContent } from "mdast";

import { mapLines, shiftByMap } from "./line-map.js";

/**
 * Indented code's own threshold. A line shallower than this is never code, and a line
 * at exactly this depth is code before it is ever offered to a list item.
 */
const CODE_INDENT = 4;

/**
 * A continuation indented five or more always belongs to the item.
 *
 * CommonMark asks a continuation to reach the item's content column, so
 * `·-····one` / blank / `·····two` -- content at offset 6, continuation at 5 -- leaves
 * the second line as root indented code. `remark-parse@8` strips the minimum
 * indentation across the *whole item*, so the shallower line lowers the item's indent
 * and both lines are content. Obsidian reports one list item holding two paragraphs.
 *
 * The threshold is measured, not derived. Across eight marker widths the arbiter joins
 * at `min(contentOffset, 5)` every time:
 *
 *     - one        content 2   joins at 2
 *     -  one       content 3   joins at 3
 *     -   one      content 4   joins at 4
 *     -    one     content 5   joins at 5
 *     ·- one       content 3   joins at 3
 *     ·-   one     content 5   joins at 5
 *     ·-    one    content 6   joins at 5   <- capped
 *     ··-    one   content 7   joins at 5   <- capped
 *
 * So the cap is `CODE_INDENT + 1`: a line indented five is past indented code's reach
 * and deep enough to be content whatever the marker did, while a line indented four is
 * claimed as code before any item sees it. We already join at the content column, so
 * this only ever fires where that column is greater than five.
 *
 * Done as a repair rather than a continuation limit because two limits were already
 * refuted with counts -- one column past the marker cost `commonmark/list-items/276`,
 * the prefix width cost seven -- and no constant satisfies both halves. A repair can
 * read both lines at once, which is the whole thing a streaming tokenizer cannot do.
 *
 * Thin corpus evidence, stated plainly: one recorded case puts an under-indented
 * continuation after a list, so the corpus cannot adjudicate the general form and the
 * arbiter table above is what carries it. `commonmark/list-items/258`, the six-space
 * version, matched before and is untouched.
 */
export function listDeepContinuationTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  const children = tree.children;
  for (let index = children.length - 2; index >= 0; index--) {
    const list = children[index];
    const code = children[index + 1];
    if (list?.type !== "list" || code?.type !== "code") continue;
    // Indented code only. A fence is a construct the author wrote.
    if (code.lang !== null && code.lang !== undefined) continue;

    const from = code.position?.start?.offset;
    const to = code.position?.end?.offset;
    const startLine = code.position?.start?.line;
    if (from === undefined || to === undefined || startLine === undefined) {
      continue;
    }
    if (source.slice(from, from + 3) === "```") continue;

    let indent = 0;
    while (source[from + indent] === " ") indent += 1;
    if (indent <= CODE_INDENT) continue;

    const item = list.children[list.children.length - 1] as
      ListItem | undefined;
    const body = item?.children[0];
    const content = body?.position?.start?.column;
    // Only where the item's own content column is what refused the line. At or below
    // the cap we already agree, and widening there would reach the seven cases the
    // prefix-width limit cost.
    if (item === undefined || content === undefined) continue;
    if (content - 1 <= indent) continue;

    const map = mapLines(source, from + indent, to, startLine);
    const parsed = reparse(map.text);
    if (parsed.children.length !== 1) continue;
    const only = parsed.children[0];
    if (only?.type !== "paragraph") continue;
    shiftByMap(only, map, 0);

    item.children.push(only as ListItem["children"][number]);
    for (const point of [(list as List).position?.end, item.position?.end]) {
      if (point && only.position?.end) Object.assign(point, only.position.end);
    }
    children.splice(index + 1, 1);
  }
}
