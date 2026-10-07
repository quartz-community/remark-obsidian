import type { Link, Paragraph, Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface Positioned extends Node {
  position?: {
    start: { line: number; column: number; offset?: number };
    end: { line: number; column: number; offset?: number };
  };
}

/** A label found by raw balanced-bracket scanning, and what follows it. */
interface Label {
  /** Offset of the opening `[`. */
  readonly open: number;
  /** Offset of the closing `]`. */
  readonly close: number;
}

/**
 * Every outermost balanced `[`…`]` pair in a slice, by raw character counting.
 *
 * Deliberately blind to every other construct, which is the whole rule: a `]` inside
 * a code span, an html attribute, a math span or a comment closes a label, because
 * nothing raised the depth before it. An escaped bracket is not a bracket.
 */
function outermostLabels(slice: string, base: number): Label[] {
  const found: Label[] = [];
  let depth = 0;
  let open = -1;

  for (let index = 0; index < slice.length; index++) {
    const character = slice[index];
    if (character === "\\") {
      index++;
      continue;
    }
    if (character === "[") {
      if (depth === 0) open = index;
      depth++;
    } else if (character === "]" && depth > 0) {
      depth--;
      if (depth === 0 && open !== -1) {
        found.push({ open: base + open, close: base + index });
        open = -1;
      }
    }
  }

  return found;
}

/** The destination of an inline link opening at `offset`, if there is one. */
function inlineDestination(
  source: string,
  offset: number,
): { url: string; end: number } | undefined {
  if (source[offset] !== "(") return undefined;
  let depth = 0;
  for (let index = offset; index < source.length; index++) {
    const character = source[index];
    if (character === "\\") {
      index++;
      continue;
    }
    if (character === "\n") return undefined;
    if (character === "(") depth++;
    else if (character === ")") {
      depth--;
      if (depth === 0) {
        return { url: source.slice(offset + 1, index), end: index + 1 };
      }
    }
  }
  return undefined;
}

/**
 * Replace every `link` with the literal source it was written as.
 *
 * Walks the array itself rather than through `visit`, because a link that *is* a
 * top-level child has no parent to splice it out of -- which is every one of these
 * cases, since the inner link is exactly what the label is wrapped around.
 */
function demoteLinks(nodes: RootContent[], source: string): void {
  for (let index = 0; index < nodes.length; index++) {
    const child = nodes[index]!;
    if (child.type === "link" || child.type === "linkReference") {
      const start = (child as Positioned).position?.start?.offset;
      const end = (child as Positioned).position?.end?.offset;
      // Only a link written in bracket form. An autolink and a GFM literal URL are
      // `link` nodes too, and Obsidian keeps both inside a label -- demoting one
      // turned `<https://…>` into text that `remark-stringify` then escapes as
      // `\<`, so formatting the same document twice kept adding a backslash.
      if (start !== undefined && end !== undefined && source[start] === "[") {
        nodes[index] = text(source.slice(start, end), start, end);
        continue;
      }
    }
    const kids = (child as unknown as { children?: RootContent[] }).children;
    if (Array.isArray(kids)) demoteLinks(kids, source);
  }
}

/**
 * Obsidian finds a link label by **raw balanced-bracket scanning**, so the
 * outermost pair wins where CommonMark gives the innermost.
 *
 *     [a [b](u) c](v)        a link to `v` whose text reads `a [b](u) c`
 *     [a [b [c](u) d](v) e](w)   a link to `w`; both inner links are literal
 *     [[a](u)](v)            a link to `v` reading `[a](u)`
 *     [a`]`b](u)             no link at all: the label is `` a` `` and a backtick
 *                            follows it, so nothing opens
 *
 * CommonMark forbids a link inside a link and resolves it by letting the *inner*
 * one win; Obsidian lets the outer one win and shows the inner as written. A
 * wikilink inside a label still resolves, which is why only `link` and
 * `linkReference` are demoted.
 *
 * The same scan explains the cases where no link forms. A `]` inside a code span,
 * an html attribute, a math span or a comment closes the label, because nothing
 * raised the bracket depth before it -- and what follows the label is then not `(`,
 * so no link opens and the whole run stays literal. CommonMark instead lets those
 * constructs win, which is its spec examples 524, 525, 526 and code-spans 342.
 *
 * Off by default. 369 of this corpus's cases hold a nested bracket pair, and the
 * option exists so that blast radius is measured rather than estimated.
 */
export function labelPrecedenceTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  visit(tree, "paragraph", (node: Node) => {
    const paragraph = node as Paragraph;
    const from = (paragraph as Positioned).position?.start?.offset;
    const to = (paragraph as Positioned).position?.end?.offset;
    if (from === undefined || to === undefined) return;

    const slice = source.slice(from, to);
    if (!slice.includes("[")) return;

    const labels = outermostLabels(slice, from);
    if (labels.length === 0) return;

    // Only where our tree disagrees: a `link` that starts inside a label this scan
    // calls outermost is one CommonMark resolved the other way round.
    const rebuilt: RootContent[] = [];
    let cursor = from;
    let changed = false;

    for (const label of labels) {
      const after = inlineDestination(source, label.close + 1);
      if (!after) continue;
      if (!containsInnerLink(paragraph, label.open, label.close)) continue;

      if (label.open > cursor) {
        rebuilt.push(
          text(source.slice(cursor, label.open), cursor, label.open),
        );
      }

      const inner = reparse(source.slice(label.open + 1, label.close));
      const body = inner.children[0];
      const children =
        body?.type === "paragraph" ? (body.children as RootContent[]) : [];
      shiftAll(children, label.open + 1);
      demoteLinks(children, source);

      rebuilt.push({
        type: "link",
        url: after.url,
        title: null,
        children: children as Link["children"],
        position: {
          start: { line: 0, column: 1, offset: label.open },
          end: { line: 0, column: 1, offset: after.end },
        },
      } as Link);
      cursor = after.end;
      changed = true;
    }

    if (!changed) return;
    if (cursor < to) rebuilt.push(text(source.slice(cursor, to), cursor, to));
    paragraph.children = rebuilt as Paragraph["children"];
  });
}

function text(value: string, start: number, end: number): RootContent {
  return {
    type: "text",
    value,
    position: {
      start: { line: 0, column: 1, offset: start },
      end: { line: 0, column: 1, offset: end },
    },
  } as Text;
}

function shiftAll(nodes: readonly RootContent[], base: number): void {
  for (const node of nodes) {
    visit(node as Node, (child: Node) => {
      const position = (child as Positioned).position;
      if (!position) return;
      for (const point of [position.start, position.end]) {
        point.offset = base + (point.offset ?? 0);
      }
    });
  }
}

/** Whether the tree holds a `link` opening strictly inside this label. */
function containsInnerLink(
  paragraph: Paragraph,
  open: number,
  close: number,
): boolean {
  let found = false;
  visit(paragraph as Node, (child: Node) => {
    if (child.type !== "link" && child.type !== "linkReference") return;
    const start = (child as Positioned).position?.start?.offset;
    if (start !== undefined && start > open && start < close) found = true;
  });
  return found;
}
