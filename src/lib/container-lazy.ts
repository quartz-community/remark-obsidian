import type {
  Blockquote,
  List,
  ListItem,
  Paragraph,
  Root,
  RootContent,
  ThematicBreak,
} from "mdast";

import { shiftByMap, type LineMap } from "./line-map.js";

const CONTAINERS = new Set(["list", "blockquote", "callout"]);

/**
 * Extend a container over the unindented line that follows it.
 *
 * CommonMark only allows lazy continuation into a paragraph, so a line at column
 * zero after a closed fence inside a list or blockquote ends the container and
 * starts a new block. Obsidian keeps it inside: `> ```\n> x\n> ```\nreal` is one
 * blockquote to it, where we reported a blockquote plus a paragraph.
 *
 * A line that looks like a footnote definition is absorbed into a quote too. It
 * does not interrupt the continuation any more than it interrupts a paragraph,
 * so `> [^1]: quoted def` / `plain column-0 line` / `[^2]: second` is all one
 * blockquote.
 *
 * An HTML line is absorbed after a **list**, and only after a list. It is the
 * container that matters, not the construct:
 *
 *     - x⏎</div>        one `list`
 *     > x⏎</div>        a `blockquote` *and* an `html`, like a paragraph
 *     para⏎</div>       a `paragraph` *and* an `html`, so html does interrupt at root
 *     - x⏎⏎</div>       `list` then `html`, since the blank line ends the container
 *
 * The quote line is the correction. This rule was written from the list and the
 * paragraph and applied to a quote as well, because they share one container set --
 * and `probe/quote-html/*` measures the quote behaving like the paragraph instead,
 * across a plain quote, a nested one, a callout, an incomplete callout and a
 * wikilink-bearing one. A 1000-seed sweep reduced **seven independent failures**
 * onto that shape before a single one of them was recorded here, which is what a
 * sweep is for when a backlog looks fragmented.
 *
 * `> x⏎<br>` stays one blockquote: a tag CommonMark cannot interrupt a paragraph
 * with never arrives as a sibling, so it is lazy continuation before this runs.
 *
 * Only a block on the very next line is absorbed. A blank line between them
 * still ends the container, which is what keeps ordinary documents untouched.
 */
/** A bare dash run, which is both a setext underline and a thematic break. */
const DASH_UNDERLINE = /^ {0,3}-+[ \t]*$/u;

/**
 * Takes apart a heading micromark built from a container's lazy line.
 *
 * The content lines go back to the container as a paragraph and the underline
 * becomes the thematic break it would have been on its own. The heading's own
 * children are reused rather than reparsed, so their positions are untouched.
 *
 * Only a dash run is split. `===` has no second reading, and Obsidian absorbs it
 * into the list as ordinary text -- which `probe/lazy-setext/list-lazy-equals`
 * already matches, so there is nothing to change there and no case that would
 * say what to do if there were.
 */
function splitLazyHeading(
  heading: RootContent,
  source: string,
): { content: Paragraph; underline: ThematicBreak } | null {
  const from = heading.position?.start?.offset;
  const to = heading.position?.end?.offset;
  const fromLine = heading.position?.start?.line;
  if (from === undefined || to === undefined || fromLine === undefined) {
    return null;
  }

  const lines = source.slice(from, to).split("\n");
  if (lines.length < 2) return null;
  const underline = lines[lines.length - 1]!;
  if (!DASH_UNDERLINE.test(underline)) return null;

  const body = lines.slice(0, -1).join("\n");
  if (body.trim() === "") return null;
  const contentEnd = from + body.length;

  return {
    content: {
      type: "paragraph",
      children: (heading as { children: Paragraph["children"] }).children,
      position: {
        start: { ...heading.position!.start },
        end: {
          line: fromLine + lines.length - 2,
          column: body.length - body.lastIndexOf("\n"),
          offset: contentEnd,
        },
      },
    },
    underline: {
      type: "thematicBreak",
      position: {
        start: {
          line: fromLine + lines.length - 1,
          column: 1,
          offset: contentEnd + 1,
        },
        end: { ...heading.position!.end },
      },
    },
  };
}

interface ParentLike {
  readonly type: string;
  readonly children?: readonly ParentLike[];
}

/**
 * Whether a container's last block is a paragraph a lazy line could join.
 *
 * Asked through the last descendant and not of the immediate child, because a
 * definition keeps its own paragraph open: `- item` / `··[^37]: a` / `x $$` ends in a
 * `footnoteDefinition`, whose last child is the paragraph the math really continues,
 * and Obsidian reports the whole thing as one list. Testing only the immediate child
 * refused that one while fixing `> <br>` over `$$⇥[`.
 *
 * An html block, a fence or a thematic break ends in no paragraph and stops the walk,
 * which is the case this exists to catch -- `<br>` closes the only block a lazy line
 * could have joined, so Obsidian reports a blockquote *and* a math.
 */
function endsInOpenParagraph(node: ParentLike): boolean {
  if (node.type === "paragraph") return true;
  const children = node.children;
  if (!children || children.length === 0) return false;
  const last = children[children.length - 1];
  return last === undefined ? false : endsInOpenParagraph(last);
}

/**
 * Root children only, and two attempts to widen that are recorded here because the case
 * they aim at looks reachable and is not.
 *
 * `[^1]: -` / `y^2$` puts an empty list item and the lazy paragraph inside a
 * `footnoteDefinition`, where Obsidian carries the item to `1:4` and we stop at `0:7`.
 *
 *   walking EVERY parent                    `listItems` 4 -> 7, and it broke
 *                                           `callout with a block title` in the unit
 *                                           suite -- a callout's children are a
 *                                           container-and-sibling pair too, so absorbing
 *                                           there folds a title's body into it
 *   walking the root plus definitions       INERT: all 406 tests pass and the count does
 *                                           not move, so the pair is reached and declined
 *                                           by one of the guards below rather than never
 *                                           seen
 *
 * Instrumented, and the guard is `CONTAINERS.has(container.type)` -- when this pass runs
 * the definition's children are not yet a list and a paragraph. That case was then closed
 * in `definition-continuation.ts`, which is the pass that actually assembles the pair, so
 * neither widening was ever going to reach it.
 *
 * A THIRD widening was built for `callout/nested-task-list`, where `> [!note]` /
 * `> - [ ] Outer` / `> > [!todo]` / `> > - [x] Inner` reports the outer task spanning to
 * the end of the inner one -- Obsidian puts the nested callout INSIDE the item where
 * CommonMark makes it a sibling. It works, and it is refused:
 *
 *   walk callout children, allow a callout after a list   `listItems` 3 -> 2
 *   ...and decline when the container follows a           unit suite green
 *      `calloutTitle`, since `> [!note] - item` / `> body`
 *      keeps its body beside the title's list
 *   round-trip unstable                                   27 -> 30
 *
 * Three more documents whose formatting changes on a second pass, for one parity case.
 * That trade is refused by the standard this repo already holds -- a consumer reformatting
 * a vault must reach a fixed point -- and the `calloutTitle` guard is the piece worth
 * keeping if anyone returns to it, since it is what made the unit suite pass.
 */
export function containerLazyTransform(tree: Root, source: string): void {
  // Repeated until nothing moves, because the loop runs backward and absorbs at most one
  // sibling per container per pass -- so a `list` / `code` / `footnoteDefinition` chain
  // collapses one link at a time. Bounded by the child count, which strictly decreases on
  // every absorb.
  let before = -1;
  while (before !== tree.children.length) {
    before = tree.children.length;
    absorbPass(tree, source);
  }
}

/**
 * Indented code, not a fence.
 *
 * A bare ``` or ~~~ fence arrives as `code` with a null `lang` exactly as indented code
 * does, so the node type cannot tell them apart and the source has to. Accepting both cost
 * `list/fence-interruption` and `hunt/gen-list-fence-outlives-item/9` -- a fence after a
 * list is its own block and the list genuinely ends at it.
 */
function isIndentedCode(node: RootContent, source: string): boolean {
  const from = node.position?.start?.offset;
  if (from === undefined) return false;
  const bol = source.lastIndexOf("\n", from - 1) + 1;
  const nl = source.indexOf("\n", from);
  const line = source.slice(bol, nl === -1 ? undefined : nl);
  return !/^[ \t]*(?:```|~~~)/u.test(line);
}

function absorbPass(tree: Root, source: string): void {
  const children = tree.children;

  for (let index = children.length - 2; index >= 0; index--) {
    const container = children[index];
    const next = children[index + 1];
    if (!container || !next) continue;
    if (!CONTAINERS.has(container.type)) continue;
    if (next.type !== "paragraph") {
      if (
        next.type !== "footnoteDefinition" &&
        next.type !== "table" &&
        // Math, but only after a LIST, which is the same restriction `html`, `heading`,
        // `blockquote` and `code` already carry and the fourth measured instance of a list
        // and a quote differing. `- item` / `text` / `$$` reports one `list` spanning the
        // `$$`, while `> quote` / `$$` reports `blockquote` and then a ROOT `math` that runs
        // to the end of the note -- so a quote does not take the opener in at all.
        // `compose.mts --isolate` is what separated them; the pair sweep had both as one
        // shape.
        !(next.type === "math" && container.type === "list") &&
        // Html, but only after a list. `- x` over `</div>` is one list to Obsidian
        // while `> x` over `</div>` is a blockquote *and* an html, exactly as
        // `para` over `</div>` is -- so a quote behaves like a paragraph here and a
        // list is the exception. Applying the list rule to both was wrong for seven
        // probes, and a 1000-seed sweep reduced seven independent failures onto this
        // shape before any of them was recorded.
        //
        // `> x` over `<br>` is unaffected and still one blockquote: a tag CommonMark
        // cannot interrupt a paragraph with never arrives here as a sibling, because
        // micromark has already taken it as lazy continuation.
        !(next.type === "html" && container.type === "list") &&
        // A heading, but only after a list. CommonMark forbids lazily continuing
        // a setext heading into a container, so micromark hands `- a` / `<br>` /
        // `b` / `---` a *root* heading of `b␤---` -- and Obsidian keeps `b` in
        // the list with the `---` left as a thematic break. A blockquote is the
        // other way round and keeps the heading at root, which is why this is
        // restricted rather than general.
        !(next.type === "heading" && container.type === "list") &&
        // A quote, but only after a list. `- a` / blank / `  [^1]: def` / `> quote`
        // reports ONE list spanning to the quote's line, with the single item spanning it
        // too -- so the quote-prefixed line continues the item rather than opening a block
        // of its own. Restricted to a list by the same reasoning as the two entries above
        // and with the same evidence shape, a recorded probe per container.
        // A CALLOUT counts as a quote here, which `compose.mts` caught: `- item` /
        // `> [!note] title` reports one `list` section in Obsidian and reported a separate
        // `callout` here, because a callout line arrives as its own node type rather than a
        // `blockquote` and this test named only the latter. Same rule, two node types.
        !(
          (next.type === "blockquote" || next.type === "callout") &&
          container.type === "list"
        ) &&
        // A list, but only after a callout. `> [!note] title` / `2. [^1]: def` reports one
        // callout spanning the marker's line, with a `listItem` inside it. Note the
        // ordered item opens at all only because a callout title is not a paragraph --
        // `calloutTitleInterruptTransform` is the pass for that, and this is where the
        // result ends up nested.
        !(
          next.type === "list" &&
          container.type === "callout" &&
          // An ordered list whose start is NOT 1, which is the whole reason it is lazy
          // continuation: CommonMark lets an ordered item interrupt a paragraph only at 1,
          // so `2.` could not have opened a list here and the line continues the callout.
          // A bullet or a `1.` CAN interrupt, and Obsidian reports a separate `list`
          // section for both -- `> [!note] title` / `- item` is `callout, list, paragraph`.
          //
          // Landed unrestricted on one corpus case, `probe/title-interrupt/two-lazy`, whose
          // marker is `2.`; `compose.mts` caught the over-reach by sweeping every ordered
          // pair of block constructs, where `callout > bullet` and `callout > ordered` both
          // diverged. No existing gate covered that composition.
          typeof next.start === "number" &&
          next.start !== 1
        ) &&
        // Indented code, but only after a list, and the reason is a chain rather than this
        // node on its own. `1. p` / `  10.     q` / `⇥%%` / `[^1]: def` has Obsidian
        // continuing the list through both later lines and reporting NO definition, while
        // the tab-indented `%%` arrives here as a ROOT `code` node that breaks the
        // absorption chain and leaves the definition exposed. Accepting the `code` lets the
        // repeat below reach the definition, which this pass already accepts.
        //
        // Scored before implementing, over all 6,818 referee documents: a root definition at
        // column 0 reachable back across adjacent root siblings to a list is swallowed by it,
        // 82 better against 26 worse, agreement +21. That is the first net-positive rule
        // measured against this oracle, and it only became measurable once `score.mts` was
        // given the tree -- the same rule approximated with a line scan scored -15.
        !(
          next.type === "code" &&
          container.type === "list" &&
          isIndentedCode(next, source)
        )
      ) {
        continue;
      }
    }

    // Measure the gap from the last non-whitespace character, not from the
    // container's end offset. An unclosed fence inside a list item pulls the
    // container's span over the following newline, so slicing from its end sees
    // one newline where the document has a blank line.
    const gapEnd = next.position?.start?.offset;
    if (gapEnd === undefined) continue;
    const before = source.slice(0, gapEnd);
    // `before.length - trimEnd().length` is the same trailing run `/\s+$/`
    // would capture, without that pattern's quadratic failure path.
    const trailing = before.slice(before.trimEnd().length);
    if (/\n[ \t]*\n/.test(trailing)) continue;

    const parent = container as List | Blockquote;
    let target =
      parent.type === "list"
        ? parent.children[parent.children.length - 1]
        : parent;
    if (!target || !("children" in target)) continue;

    // A lazy line joins the INNERMOST open item, not the outermost. `- - ``` ` /
    // `    fake` / `    ``` ` / `after` reports the inner item spanning to the end of
    // `after` -- `0:2-3:9` -- where pushing onto the outer item left the inner one at
    // `2:7`. Descending while the last child is a list is the whole fix; a blockquote
    // keeps its own target because there is no item to descend into.
    const descended: (List | ListItem)[] = [];
    while (parent.type === "list") {
      const kids = (target as ParentLike).children;
      const last = kids?.[kids.length - 1];
      if (!last || last.type !== "list") break;
      const inner = (last as ParentLike).children;
      const item = inner?.[inner.length - 1];
      if (!item || !("children" in item)) break;
      descended.push(target as ListItem, last as List);
      target = item as typeof target;
    }

    // Display math is absorbed only onto a paragraph, which is lazy continuation's
    // actual precondition: a container continues lazily when its last open block is
    // a paragraph, and an html block or a fence is not one. `> <br>` over `$$⇥[` is
    // a blockquote *and* a math to Obsidian -- two sections -- because the `<br>`
    // closed the only block a lazy line could have joined.
    //
    // Scoped to math rather than stated generally. The same precondition plainly
    // governs the other absorbable types, but each of those arrived with its own
    // measured family -- html after a list, a heading after a list -- and the corpus
    // holds exactly one case of a column-zero `$$` after a container line, so it
    // cannot adjudicate the general form. Widening it is a probe wave, not a guess.
    if (next.type === "math" && !endsInOpenParagraph(target as ParentLike)) {
      continue;
    }

    if (next.type === "heading") {
      const split = splitLazyHeading(next, source);
      if (!split) continue;
      (target.children as unknown[]).push(split.content);
      for (const point of [
        parent.position?.end,
        target.position?.end,
        ...descended.map((n) => n.position?.end),
      ]) {
        if (point) Object.assign(point, { ...split.content.position!.end });
      }
      children.splice(index + 1, 1, split.underline);
      continue;
    }

    (target.children as unknown[]).push(next as Paragraph);
    if (parent.position && next.position?.end) {
      parent.position.end = { ...next.position.end };
    }
    if (target !== parent && target.position && next.position?.end) {
      target.position.end = { ...next.position.end };
    }
    // Every container descended through has to be stretched over the absorbed block too,
    // which is the same reason `trailingEmptyItem` returns its chain.
    for (const node of descended) {
      if (node.position && next.position?.end) {
        node.position.end = { ...next.position.end };
      }
    }
    children.splice(index + 1, 1);
  }
}

/**
 * The deepest trailing list item that holds nothing, with everything enclosing it.
 *
 * The chain comes back because each container on the path has to be stretched over
 * the absorbed block, not just the item that receives it.
 */
function trailingEmptyItem(
  list: List,
): { item: ListItem; chain: (List | ListItem)[] } | undefined {
  const item = list.children[list.children.length - 1];
  if (!item) return undefined;
  // A kept `%%` comment is a leaf, and it can be a list's direct child: `- <!--` over
  // an indented body puts one where a `listItem` is assumed. It is not a list item, so
  // it is not a trailing empty one either -- 17 documents in the referee corpus crashed
  // here on `item.children` being undefined, every one of them a comment inside an item.
  if (!Array.isArray(item.children)) return undefined;
  const last = item.children[item.children.length - 1];
  if (last?.type === "list") {
    const deeper = trailingEmptyItem(last);
    if (deeper)
      return { item: deeper.item, chain: [list, item, ...deeper.chain] };
  }
  return item.children.length === 0 ? { item, chain: [list, item] } : undefined;
}

/** Where an item's content column is: past its marker and the space after it. */
function contentIndent(item: ListItem, source: string): number | undefined {
  const start = item.position?.start?.offset;
  const column = item.position?.start?.column;
  if (start === undefined || column === undefined) return undefined;
  const lineEnd = source.indexOf("\n", start);
  const line = source.slice(start, lineEnd === -1 ? undefined : lineEnd);
  const marker = /^(?:[-*+]|\d{1,9}[.)])/u.exec(line);
  if (!marker) return undefined;
  return column - 1 + marker[0].length + 1;
}

/** Strip up to `indent` leading spaces a line, remembering the real offsets. */
function dedentBy(
  source: string,
  start: number,
  end: number,
  startLine: number,
  indent: number,
): LineMap {
  const raw = source.slice(start, end).split("\n");
  const text: string[] = [];
  const starts: number[] = [];
  const lines: number[] = [];
  let offset = start;

  for (let index = 0; index < raw.length; index++) {
    const line = raw[index]!;
    let strip = 0;
    while (strip < indent && line[strip] === " ") strip++;
    starts.push(offset + strip);
    lines.push(startLine + index);
    text.push(line.slice(strip));
    offset += line.length + 1;
  }

  return { text: text.join("\n"), starts, lines };
}

/**
 * Extend a list over an indented block that follows a blank line.
 *
 * The mirror of the pass above, which absorbs only when there is *no* blank line.
 * Here the blank line is the whole point. CommonMark says an empty list item takes
 * no further content -- cmark's own example 280 reads `-` / blank / `  foo` as a
 * list *and* a paragraph -- and Obsidian reads it as one list:
 *
 *     -⏎⏎  foo           one list, where we reported list + paragraph
 *     1.⏎⏎   foo         the same, at an ordered marker's wider content column
 *     -⏎⏎⏎  foo          a second blank line changes nothing
 *     -⏎⏎  -⏎⏎    foo    the *inner* item takes it, so the shape is `ul > ul`
 *
 * Only a trailing item that is empty, which is measured rather than assumed: every
 * probed variant whose item carries content already matches, because micromark takes
 * the continuation itself. Both quote forms match too -- `>` / blank / `foo` really
 * is a blockquote and a paragraph to Obsidian -- so this is a list rule, not a
 * container one, and that is why it does not reuse `CONTAINERS` above.
 *
 * The block is re-parsed dedented by the item's content column, so `    foo` under a
 * nested item becomes a paragraph rather than staying the indented code block we
 * reported before. Offsets come back through `shiftByMap`, since the dedent removes a
 * different number of characters on each line.
 */
export function listEmptyItemTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;
  const children = tree.children;

  for (let index = children.length - 2; index >= 0; index--) {
    const list = children[index];
    const next = children[index + 1];
    if (list?.type !== "list" || !next) continue;

    const from = next.position?.start?.offset;
    const to = next.position?.end?.offset;
    const startLine = next.position?.start?.line;
    const listEnd = list.position?.end?.offset;
    if (from === undefined || to === undefined) continue;
    if (startLine === undefined || listEnd === undefined) continue;

    // A blank line is required here, which is exactly what the pass above rejects.
    if (!/\n[ \t]*\n/.test(source.slice(listEnd, from))) continue;

    const found = trailingEmptyItem(list);
    if (!found) continue;
    const { item, chain } = found;
    const indent = contentIndent(item, source);
    if (indent === undefined) continue;

    const lineStart = source.lastIndexOf("\n", from - 1) + 1;
    const available = (/^ */u.exec(source.slice(lineStart)) ?? [""])[0].length;
    if (available < indent) continue;

    const map = dedentBy(source, lineStart, to, startLine, indent);
    const parsed = reparse(map.text);
    if (parsed.children.length === 0) continue;
    for (const child of parsed.children) shiftByMap(child, map, 0);

    (item.children as unknown[]).push(...parsed.children);
    // Every container on the path to the item now ends where the block does.
    for (const node of chain) {
      if (node.position && next.position?.end) {
        node.position.end = { ...next.position.end };
      }
    }
    children.splice(index + 1, 1);
  }
}
