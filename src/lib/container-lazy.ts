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
 * An HTML line is absorbed for the same reason, and the legacy stack draws the
 * boundary sharply -- it is the container that matters, not the construct:
 *
 *     - x⏎</div>        one `list`
 *     para⏎</div>       a `paragraph` *and* an `html`, so html does interrupt at root
 *     - x⏎⏎</div>       `list` then `html`, since the blank line ends the container
 *
 * Obsidian agrees on all three, and five recorded cases reported a stray `html`
 * section after a list before this.
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

export function containerLazyTransform(tree: Root, source: string): void {
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
        next.type !== "math" &&
        next.type !== "html" &&
        // A heading, but only after a list. CommonMark forbids lazily continuing
        // a setext heading into a container, so micromark hands `- a` / `<br>` /
        // `b` / `---` a *root* heading of `b␤---` -- and Obsidian keeps `b` in
        // the list with the `---` left as a thematic break. A blockquote is the
        // other way round and keeps the heading at root, which is why this is
        // restricted rather than general.
        !(next.type === "heading" && container.type === "list")
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
    const target =
      parent.type === "list"
        ? parent.children[parent.children.length - 1]
        : parent;
    if (!target || !("children" in target)) continue;

    if (next.type === "heading") {
      const split = splitLazyHeading(next, source);
      if (!split) continue;
      (target.children as unknown[]).push(split.content);
      for (const point of [parent.position?.end, target.position?.end]) {
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
