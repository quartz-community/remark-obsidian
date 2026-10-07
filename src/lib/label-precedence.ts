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

const WHITESPACE = /[ \t\r\n]/u;

/** Skip whitespace, refusing a blank line as CommonMark does. */
function skipSpace(source: string, from: number): number | undefined {
  let index = from;
  let newlines = 0;
  while (index < source.length && WHITESPACE.test(source[index]!)) {
    if (source[index] === "\n" && ++newlines > 1) return undefined;
    index++;
  }
  return index;
}

/**
 * CommonMark's inline destination and title, in full.
 *
 * The naive version this replaces returned whatever sat between the parens, so a
 * title landed in the url -- which cost 35 regressions the moment this pass was
 * allowed to build links the tree had not already found. `probe/link-surface/*`
 * pins every form: three title quote styles, an angle destination, an empty one,
 * nested and escaped parens, an unterminated title and junk after a closed one.
 */
/**
 * A full reference destination, `[label]`, following a link's label.
 *
 * `[a [b](u)][r]` is a reference to `r` whose text reads `a [b](u)` -- the same
 * outermost-pair rule as the inline form, with `[r]` where `(u)` would be. Only the
 * full form: a collapsed `[]` or a shortcut reference resolves against the label
 * itself, which this pass has just redefined, and no golden covers either.
 */
function referenceDestination(
  source: string,
  offset: number,
): { url: string; reference: string; end: number } | undefined {
  if (source[offset] !== "[") return undefined;
  let index = offset + 1;
  while (index < source.length) {
    const character = source[index]!;
    if (character === "\\") {
      index += 2;
      continue;
    }
    if (character === "[" || character === "\n") return undefined;
    if (character === "]") {
      const reference = source.slice(offset + 1, index);
      if (reference === "") return undefined;
      return { url: "", reference, end: index + 1 };
    }
    index++;
  }
  return undefined;
}

function inlineDestination(
  source: string,
  offset: number,
): { url: string; end: number; reference?: undefined } | undefined {
  if (source[offset] !== "(") return undefined;
  let index = skipSpace(source, offset + 1);
  if (index === undefined) return undefined;

  let url: string;
  if (source[index] === "<") {
    // An angle destination may hold unbalanced parens -- CommonMark's example 499
    // is `(<foo(and(bar)>)` -- so counting them is wrong here.
    let close = index + 1;
    while (close < source.length && source[close] !== ">") {
      if (source[close] === "\n") return undefined;
      if (source[close] === "\\") close++;
      close++;
    }
    if (source[close] !== ">") return undefined;
    url = source.slice(index + 1, close);
    index = close + 1;
  } else {
    const start = index;
    let depth = 0;
    while (index < source.length) {
      const character = source[index]!;
      if (character === "\\") {
        index += 2;
        continue;
      }
      if (WHITESPACE.test(character)) break;
      if (character === "(") depth++;
      else if (character === ")") {
        if (depth === 0) break;
        depth--;
      }
      index++;
    }
    if (depth !== 0) return undefined;
    url = source.slice(start, index);
  }

  const afterUrl = skipSpace(source, index);
  if (afterUrl === undefined) return undefined;
  index = afterUrl;

  const opener = source[index];
  if (opener === '"' || opener === "'" || opener === "(") {
    const closer = opener === "(" ? ")" : opener;
    let close = index + 1;
    while (close < source.length && source[close] !== closer) {
      if (source[close] === "\\") close++;
      close++;
    }
    if (source[close] !== closer) return undefined;
    const afterTitle = skipSpace(source, close + 1);
    if (afterTitle === undefined) return undefined;
    index = afterTitle;
  }

  if (source[index] !== ")") return undefined;
  return { url, end: index + 1 };
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
 * Deliberately fires only where the tree already found a link -- an inner one where
 * this scan says the outer pair wins, or one whose label runs past the raw close.
 * Building a link the tree found *no* link for was measured and refused: it gains 8
 * cases and costs **35**, because the naive destination reader here takes a title as
 * part of the url, and because a label belonging to an image, a wikilink or a
 * footnote reference looks identical to one belonging to a link. Closing
 * `[foo`](u)`` needs a real CommonMark destination parser, not a wider trigger.
 */
/**
 * The offset of the `]` that closed this link's label.
 *
 * Found by asking which `]` yields a destination ending exactly where the link
 * does, rather than by counting delimiters backwards from the tail -- an angle
 * destination can hold unbalanced parens, and counting them put the label close
 * *inside* the destination and demoted a perfectly good link.
 */
function labelCloseOf(source: string, start: number, end: number): number {
  for (let index = start + 1; index < end; index++) {
    if (source[index] === "\\") {
      index++;
      continue;
    }
    if (source[index] !== "]") continue;
    if (inlineDestination(source, index + 1)?.end === end) return index;
    if (source[index + 1] === "[" && source[end - 1] === "]") return index;
  }
  return -1;
}

/** Where raw bracket counting from `open` puts the matching `]`. */
function rawCloseFrom(source: string, open: number, limit: number): number {
  let depth = 0;
  for (let index = open; index < limit; index++) {
    const character = source[index];
    if (character === "\\") {
      index++;
      continue;
    }
    if (character === "[") depth++;
    else if (character === "]") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * Cut a link back to the label raw scanning allows, or remove it entirely.
 *
 * CommonMark lets a code span, an html attribute, a math span or a comment own a
 * `]` and carries the label past it. Obsidian's scan does not look inside anything,
 * so that `]` closes the label -- and what follows is usually not `(`, which means
 * no link at all:
 *
 *     [a`]`b](u)      entirely literal: the label is `` a` `` and a backtick follows
 *     [foo`](u)`      a link to `u` labelled `` foo` ``, with a backtick left over
 *
 * Same comparison either way: where the tree's label runs past the raw close, the
 * link is rebuilt if a destination follows that close and demoted if not.
 */
function retractLinks(
  paragraph: Paragraph,
  source: string,
  reparse: (markdown: string) => Root,
): boolean {
  let changed = false;

  const walk = (nodes: RootContent[]): void => {
    for (let index = 0; index < nodes.length; index++) {
      const child = nodes[index]!;
      const kids = (child as unknown as { children?: RootContent[] }).children;
      if (child.type !== "link") {
        if (Array.isArray(kids)) walk(kids);
        continue;
      }
      const start = (child as Positioned).position?.start?.offset;
      const end = (child as Positioned).position?.end?.offset;
      if (start === undefined || end === undefined) continue;
      if (source[start] !== "[") continue;

      const treeClose = labelCloseOf(source, start, end);
      const rawClose = rawCloseFrom(source, start, end);
      if (treeClose === -1 || rawClose === -1 || rawClose >= treeClose) {
        if (Array.isArray(kids)) walk(kids);
        continue;
      }

      const after = inlineDestination(source, rawClose + 1);
      if (!after) {
        nodes[index] = text(source.slice(start, end), start, end);
        changed = true;
        continue;
      }

      const inner = reparse(source.slice(start + 1, rawClose));
      const body = inner.children[0];
      const children =
        body?.type === "paragraph" ? (body.children as RootContent[]) : [];
      shiftAll(children, start + 1);
      demoteLinks(children, source);
      nodes[index] = {
        type: "link",
        url: after.url,
        title: null,
        children: children as Link["children"],
        position: {
          start: { line: 0, column: 1, offset: start },
          end: { line: 0, column: 1, offset: after.end },
        },
      } as Link;
      if (after.end < end) {
        nodes.splice(
          index + 1,
          0,
          text(source.slice(after.end, end), after.end, end),
        );
        index++;
      }
      changed = true;
    }
  };

  walk(paragraph.children as RootContent[]);
  return changed;
}

export function labelPrecedenceTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  // Labels the document defines, so the tail of a relabelled run can still resolve.
  const defined = new Set<string>();
  visit(tree, "definition", (node: Node) => {
    defined.add(
      String(
        (node as unknown as { identifier: string }).identifier,
      ).toLowerCase(),
    );
  });

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
    // Past the last label *and its destination*, whether or not it was rebuilt. A
    // reference destination is itself a bracket pair, so the scan offers it as the
    // next label: `[foo][bar][baz]` would have had `[bar]` -- already spent as
    // `[foo]`'s destination -- relabelled and pointed at `[baz]`.
    let consumed = from;

    for (const label of labels) {
      if (label.open < consumed) continue;
      const after =
        inlineDestination(source, label.close + 1) ??
        referenceDestination(source, label.close + 1);
      if (!after) continue;
      consumed = after.end;
      // Not every `[` opens a link label: an image, a wikilink and a footnote
      // reference all start with one and are indistinguishable from a link's at
      // this level. Asked of the *tree* rather than of the characters, because
      // `[[a](u)](v)` is a link to `v` whose label happens to begin with a second
      // bracket -- a character guard on `[[` skipped it along with the wikilinks.
      if (claimedByOther(paragraph, label.open)) continue;
      // And not when another construct opened *before* this bracket and still holds
      // it. Whichever opens first wins: `[foo *bar](u)*` is a link to `u`, while
      // `*[foo*](/uri)` is emphasis with the brackets left as text, and a `[link](u)`
      // inside a `%%` comment is not a link at all.
      if (enclosedByConstruct(paragraph, label.open)) continue;
      // Either the tree resolved this the other way round -- an inner link where the
      // scan says the outer pair wins -- or it found no link here at all, which is
      // what a construct swallowing the `](u)` leaves behind.
      if (
        !containsInnerLink(paragraph, label.open, label.close) &&
        linkStartsAt(paragraph, label.open)
      ) {
        continue;
      }

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
        ...(after.reference === undefined
          ? { type: "link", url: after.url, title: null }
          : {
              type: "linkReference",
              identifier: after.reference.toLowerCase(),
              label: after.reference,
              referenceType: "full",
            }),
        children: children as Link["children"],
        position: {
          start: { line: 0, column: 1, offset: label.open },
          end: { line: 0, column: 1, offset: after.end },
        },
      } as unknown as Link);
      cursor = after.end;
      changed = true;
    }

    if (changed) {
      if (cursor < to) pushTail(rebuilt, source, cursor, to, defined);
      paragraph.children = rebuilt as Paragraph["children"];
      return;
    }

    retractLinks(paragraph, source, reparse);
  });
}

/**
 * The run after the last relabelled link, with any defined label still resolving.
 *
 * `[foo][bar][baz]` with only `baz` defined is `[foo][bar]` as literal text and
 * `[baz]` as a shortcut reference reading `baz`. Taking `[foo][bar]` as the outer
 * reference is what this pass is for, and pushing everything after it as one text
 * node left `[baz]` written out -- where `commonmark/links/570`, whose `[bar]` *is*
 * defined, matched because micromark had already built both references itself.
 *
 * Only a **defined** label is promoted. An undefined one is left as text, which is
 * what it renders as anyway, and promoting it would invent a node for characters
 * no construct claimed.
 */
function pushTail(
  rebuilt: RootContent[],
  source: string,
  from: number,
  to: number,
  defined: ReadonlySet<string>,
): void {
  let cursor = from;
  for (const label of outermostLabels(source.slice(from, to), from)) {
    const name = source.slice(label.open + 1, label.close);
    if (!defined.has(name.toLowerCase())) continue;
    // A destination of its own makes it a full or inline link, which the main
    // scan above owns; only a bare pair is a shortcut.
    if (
      inlineDestination(source, label.close + 1) ??
      referenceDestination(source, label.close + 1)
    ) {
      continue;
    }
    if (label.open > cursor) {
      rebuilt.push(text(source.slice(cursor, label.open), cursor, label.open));
    }
    rebuilt.push({
      type: "linkReference",
      identifier: name.toLowerCase(),
      label: name,
      referenceType: "shortcut",
      children: [text(name, label.open + 1, label.close)],
      position: {
        start: { line: 0, column: 1, offset: label.open },
        end: { line: 0, column: 1, offset: label.close + 1 },
      },
    } as unknown as RootContent);
    cursor = label.close + 1;
  }
  if (cursor < to) rebuilt.push(text(source.slice(cursor, to), cursor, to));
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

/**
 * Whether a construct that opened earlier still encloses this bracket.
 *
 * Strictly inside: a construct beginning *at* the bracket is this label's own
 * business, and one beginning before it has already claimed the character.
 */
function enclosedByConstruct(paragraph: Paragraph, open: number): boolean {
  let found = false;
  visit(paragraph as Node, (child: Node) => {
    if (
      child.type !== "emphasis" &&
      child.type !== "strong" &&
      child.type !== "delete" &&
      child.type !== "comment" &&
      child.type !== "highlight" &&
      child.type !== "inlineCode" &&
      child.type !== "inlineMath" &&
      child.type !== "html"
    ) {
      return;
    }
    const start = (child as Positioned).position?.start?.offset;
    const end = (child as Positioned).position?.end?.offset;
    if (
      start !== undefined &&
      end !== undefined &&
      start < open &&
      open < end
    ) {
      found = true;
    }
  });
  return found;
}

/**
 * Whether something other than a link already owns this bracket.
 *
 * An image's own span starts at its `!`, one before the bracket, so it is checked
 * at both offsets.
 */
function claimedByOther(paragraph: Paragraph, open: number): boolean {
  let found = false;
  visit(paragraph as Node, (child: Node) => {
    if (
      child.type !== "image" &&
      child.type !== "imageReference" &&
      child.type !== "wikilink" &&
      child.type !== "footnoteReference" &&
      child.type !== "footnote"
    ) {
      return;
    }
    const start = (child as Positioned).position?.start?.offset;
    if (start === open || start === open - 1) found = true;
  });
  return found;
}

/** Whether the tree already holds a `link` beginning at this offset. */
function linkStartsAt(paragraph: Paragraph, open: number): boolean {
  let found = false;
  visit(paragraph as Node, (child: Node) => {
    if (child.type !== "link" && child.type !== "linkReference") return;
    if ((child as Positioned).position?.start?.offset === open) found = true;
  });
  return found;
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
