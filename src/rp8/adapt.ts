/**
 * PROTOTYPE: remark-parse 8's tree, reshaped to this package's public node types.
 *
 * Positions are never invented: every node keeps the position the rp8 reader gave it, except
 * that a block's end at column 1 of a later line is pulled back to the end of the line before,
 * which is where mdast places a block's end.
 */
import type { Root } from "mdast";
import { decodeString } from "micromark-util-decode-string";
import { normalizeIdentifier } from "micromark-util-normalize-identifier";

import { mathDisplayTransform } from "../lib/math-display.js";
import { resolveTarget, spelledTarget } from "../lib/wikilink-target.js";
import {
  parse8WithOffsets,
  type Features,
  type Node8,
  type Point8,
} from "./reader.js";

/** The plugin options the remark-parse 8 path honours; each maps onto a reader or a step here. */
export interface LegacyOptions extends Features {
  keepComments: boolean;
  parseComments: boolean;
  lineOffsets: boolean;
  bareFootnoteRefs: boolean;
}

interface Context {
  doc: string;
  definitions: Set<string>;
  footnotes: Set<string>;
  options: LegacyOptions;
}

/**
 * A label as `mdast-util-from-markdown` reports it: escapes and character references decoded.
 * remark-parse 8 keeps the raw source, which the writer then escapes again on every pass --
 * `[ref\\[]` grew a backslash pair per format. The identifier is still made from the raw text.
 */
const decodeLabel = (label: unknown): unknown =>
  typeof label === "string" ? decodeString(label) : label;

const fold = (label: string): string =>
  label
    .replace(/[\t\n\r ]+/gu, " ")
    .toLowerCase()
    .toUpperCase()
    .toLowerCase();

function collectDefinitions(
  node: Node8,
  links: Set<string>,
  footnotes: Set<string>,
): void {
  if (node.type === "definition")
    links.add(fold(String(node.label ?? node.identifier)));
  if (node.type === "footnoteDefinition")
    footnotes.add(String(node.identifier));
  for (const child of node.children ?? [])
    collectDefinitions(child, links, footnotes);
}

/** Adjacent text nodes, as one: the reverts above leave runs a tokenizer would have merged. */
function mergeText(node: Node8): void {
  if (!node.children) return;
  const out: Node8[] = [];
  for (const child of node.children) {
    mergeText(child);
    const prev = out[out.length - 1];
    if (
      prev?.type === "text" &&
      child.type === "text" &&
      prev.position.end.offset === child.position.start.offset
    ) {
      prev.value = String(prev.value) + String(child.value);
      prev.position = { start: prev.position.start, end: child.position.end };
    } else out.push(child);
  }
  node.children = out;
}

function pointAt(doc: string, offset: number): Point8 {
  const bol = doc.lastIndexOf("\n", offset - 1) + 1;
  let line = 1;
  for (
    let at = doc.indexOf("\n");
    at !== -1 && at < offset;
    at = doc.indexOf("\n", at + 1)
  ) {
    line++;
  }
  return { line, column: offset - bol + 1, offset };
}

function pullBack(node: Node8, doc: string): void {
  const { start, end } = node.position;
  if (end.column === 1 && end.line > start.line && end.offset > start.offset) {
    node.position.end = pointAt(doc, end.offset - 1);
  }
}

function at(node: Node8): { start: Point8; end: Point8 } {
  const { start, end } = node.position;
  return {
    start: { line: start.line, column: start.column, offset: start.offset },
    end: { line: end.line, column: end.column, offset: end.offset },
  };
}

function text(doc: string, from: number, to: number): Node8 {
  return {
    type: "text",
    value: doc.slice(from, to),
    position: { start: pointAt(doc, from), end: pointAt(doc, to) },
  };
}

// Only `\#`. Obsidian keeps a backslash before `]` in a target or heading: `[[a\]b]]` links to
// `a\]b` and `[[link\](u)]]` to `link\](u)` (recorded live, 1.15.0; the nightly differential
// fuzz found it). A trailing backslash, `[[a\]]]`, is the one it drops, handled below.
const UNESCAPE = /\\(#)/g;

/**
 * `[[path#heading|alias]]`, split as `syntax/wikilink.ts` splits it and finished as
 * `wikilinkFromMarkdown` finishes it. Inside a wikilink a backslash is an ordinary character:
 * an escaped `|` or `#` splits anyway, and a LEADING `|` is part of the path (`[[|b]]`).
 */
function wikilink(raw: string): { type: "wikilink"; [key: string]: unknown } {
  const embedded = raw.startsWith("!");
  const inner = raw.slice(embedded ? 3 : 2, -2);
  let split = -1;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "#" || (inner[i] === "|" && i > 0)) {
      split = i;
      break;
    }
  }
  const parts = { path: !inner.startsWith("#"), heading: false, alias: false };
  const node = { path: inner, heading: "", alias: "" };
  if (split !== -1) {
    node.path = inner.slice(0, split);
    if (inner[split] === "#") {
      parts.heading = true;
      const pipe = inner.indexOf("|", split + 1);
      node.heading = inner.slice(split + 1, pipe === -1 ? undefined : pipe);
      if (pipe !== -1) {
        parts.alias = true;
        node.alias = inner.slice(pipe + 1);
      }
    } else {
      parts.alias = true;
      node.alias = inner.slice(split + 1);
    }
  }
  node.path = node.path.replace(UNESCAPE, "$1");
  node.heading = node.heading.replace(UNESCAPE, "$1");
  const order = (["path", "heading", "alias"] as const).filter((k) => parts[k]);
  const first = order[0];
  const last = order[order.length - 1];
  if (first) node[first] = node[first].trimStart();
  if (last) node[last] = node[last].trimEnd();
  const written = node.path;
  const writtenHeading = node.heading;
  // Resolved NFC, as Obsidian resolves it: `[[cafe\u0301]]` links to `caf\u00e9`, and `a#cafe\u0301` to
  // the composed heading. Only the resolved parts: `value` keeps what the author typed.
  node.path = resolveTarget(node.path);
  node.heading = resolveTarget(node.heading);
  const spelled = spelledTarget(written, writtenHeading, node);
  const resolved = parts.heading ? "heading" : parts.path ? "path" : undefined;
  let stripped: "path" | "heading" | undefined;
  if (resolved && node[resolved].endsWith("\\")) {
    node[resolved] = node[resolved].slice(0, -1);
    stripped = resolved;
  }
  const value = embedded
    ? node.path
    : parts.alias
      ? node.alias
      : [written, ...writtenHeading.split("#")].filter(Boolean).join(" > ");
  return {
    type: "wikilink",
    value,
    embedded,
    ...node,
    // Kept for the writer, which builds from the parts (see `mdast/wikilink.ts`).
    // Only before `]]`, not before an alias's `|`, which is a cell's pipe escape.
    ...(stripped && !parts.alias
      ? { data: { strippedBackslash: stripped, ...spelled } }
      : spelled
        ? { data: spelled }
        : {}),
  };
}

const MATH_DISPLAY = (value: string) => ({
  hName: "pre",
  hChildren: [
    {
      type: "element",
      tagName: "code",
      properties: { className: ["language-math", "math-display"] },
      children: [{ type: "text", value }],
    },
  ],
});

const MATH_INLINE = (value: string) => ({
  hName: "code",
  hProperties: { className: ["language-math", "math-inline"] },
  hChildren: [{ type: "text", value }],
});

function convertAll(
  nodes: Node8[] | undefined,
  ctx: Context,
  inNote: boolean,
): Node8[] {
  const out: Node8[] = [];
  for (const node of nodes ?? []) out.push(...convert(node, ctx, inNote));
  return out;
}

function convert(node: Node8, ctx: Context, inNote: boolean): Node8[] {
  const { doc } = ctx;
  const position = at(node);
  const kids = (n = inNote) => convertAll(node.children, ctx, n);

  switch (node.type) {
    case "footnoteReference":
      // E3: nothing inside an inline footnote is a reference.
      // Without `bareFootnoteRefs`, a reference nothing defines stays literal, as in GFM.
      if (
        inNote ||
        (!ctx.options.bareFootnoteRefs &&
          !ctx.footnotes.has(String(node.identifier)))
      )
        return [text(doc, position.start.offset, position.end.offset)];
      return [
        {
          type: "footnoteReference",
          identifier: node.identifier,
          label: node.label,
          position,
        },
      ];
    case "footnoteDefinition": {
      pullBack(node, doc);
      return [
        {
          type: "footnoteDefinition",
          identifier: node.identifier,
          label: node.label,
          children: kids(),
          position: at(node),
        },
      ];
    }
    case "footnote":
      return [{ type: "footnote", children: kids(true), position }];
    case "highlight": {
      // Continuation indent is not highlight text (`legacyHighlightQueue`'s `planBody`).
      const strip = (n: Node8): void => {
        if (n.type === "text")
          n.value = String(n.value).replace(/\n[ \t]+/gu, "\n");
        for (const child of n.children ?? []) strip(child);
      };
      const children = kids();
      children.forEach(strip);
      return [{ type: "highlight", children, position }];
    }
    case "percentComment": {
      if (!ctx.options.keepComments) return [];
      return [
        {
          type: "comment",
          // The body as the reader saw it, without container prefixes: `commentToMarkdown`
          // writes this back, and inside a quote the writer adds `> ` itself.
          value: String(node.body),
          data: { hName: "obsidian-comment", hChildren: [] },
          ...(ctx.options.parseComments ? { children: kids() } : {}),
          position,
        },
      ];
    }
    case "wikiLink":
      return [{ ...wikilink(String(node.value)), position }];
    case "yaml": {
      // The body between the fences, as `mdast-util-frontmatter` reports it.
      return [
        {
          type: "yaml",
          value: String(node.value).split("\n").slice(1, -1).join("\n"),
          position,
        },
      ];
    }
    case "math":
      return [
        {
          type: "math",
          value: node.value,
          meta: null,
          data: MATH_DISPLAY(String(node.value)),
          position,
        },
      ];
    case "inlineMath":
      return [
        {
          type: "inlineMath",
          value: node.value,
          data: MATH_INLINE(String(node.value)),
          position,
        },
      ];
    case "linkReference":
    case "imageReference": {
      const { type, label, referenceType, alt } = node;
      // Obsidian neither trims nor collapses a label (rule 18a), but folds case fully (`ẞ`/`SS`).
      if (
        referenceType !== "full" &&
        !ctx.definitions.has(fold(String(label)))
      ) {
        // Undefined and not full: plain text, as the current tree has it.
        const children = type === "linkReference" ? kids() : [];
        if (children.length === 0)
          return [text(doc, position.start.offset, position.end.offset)];
        const first = children[0]!.position.start.offset;
        const last = children[children.length - 1]!.position.end.offset;
        return [
          text(doc, position.start.offset, first),
          ...children,
          text(doc, last, position.end.offset),
        ];
      }
      const identifier = normalizeIdentifier(
        String(label ?? node.identifier),
      ).toLowerCase();
      // The label as written, where decoding changed it, for the writer: written decoded,
      // `[x][&amp;]` came back `[x][&]`, another identifier (`link-reference-to-markdown.ts`).
      const spelled =
        referenceType === "full" && decodeLabel(label) !== label
          ? { data: { spelledLabel: label } }
          : {};
      return [
        type === "imageReference"
          ? {
              type,
              identifier,
              label: decodeLabel(label),
              referenceType,
              alt,
              position,
              ...spelled,
            }
          : {
              type,
              identifier,
              label: decodeLabel(label),
              referenceType,
              children: kids(),
              position,
              ...spelled,
            },
      ];
    }
    case "definition": {
      const { label, url, title } = node;
      const identifier = normalizeIdentifier(
        String(label ?? node.identifier),
      ).toLowerCase();
      return [
        {
          type: "definition",
          identifier,
          label: decodeLabel(label),
          title: title ?? null,
          url,
          position,
        },
      ];
    }
    case "blockquote": {
      const children = kids();
      const head = node.children?.[0];
      if (head?.type !== "calloutTitle")
        return [{ type: "blockquote", children, position }];
      const marker = /^\[!([^\]\n]+)\]([-+]?)/u.exec(String(head.marker))!;
      const titleBlocks = children[0]!.children ?? [];
      // The title as `calloutTransform` reads it: every value under the title, joined.
      const collect = (nodes: readonly Node8[]): string =>
        nodes
          .map((n) =>
            "value" in n ? String(n.value) : collect(n.children ?? []),
          )
          .join("");
      let title = collect(titleBlocks).trim();
      const body = children.slice(1);
      const titleNode: Node8[] = [];
      if (titleBlocks.length === 1 && titleBlocks[0]!.type === "paragraph") {
        titleNode.push({
          type: "calloutTitle",
          children: titleBlocks[0]!.children,
          position: titleBlocks[0]!.position,
        });
      } else if (titleBlocks.length > 0) {
        // A block on the title line (A4) leaves the title empty, zero-width where the block starts.
        const startAt = titleBlocks[0]!.position.start;
        title = "";
        titleNode.push({
          type: "calloutTitle",
          children: [],
          position: { start: startAt, end: startAt },
        });
        body.unshift(...titleBlocks);
      }
      return [
        {
          type: "callout",
          calloutType: marker[1]!.trim(),
          title,
          collapsed:
            marker[2] === "-" ? true : marker[2] === "+" ? false : null,
          children: [...titleNode, ...body],
          position,
        },
      ];
    }
    case "listItem": {
      const out: Node8 = {
        type: "listItem",
        spread: node.spread,
        checked: node.checked ?? null,
        children: kids(),
        position,
      };
      if (node.checked !== null && node.checked !== undefined) {
        const box = /^[ \t]*(?:[-+*]|\d+[.)])[ \t]+\[(.)\]/u.exec(
          doc.slice(position.start.offset),
        );
        const char = box?.[1] ?? (node.checked ? "x" : " ");
        out.checked = char !== " ";
        out.data = { taskChar: char, hProperties: { dataTaskChar: char } };
      }
      return [out];
    }
    case "paragraph": {
      // CommonMark strips a paragraph's leading indentation from its content; remark-parse 8
      // keeps it in the first text value. The paragraph itself keeps Obsidian's column.
      const children = kids();
      const head = children[0];
      if (head?.type === "text") {
        const lead = /^[ \t]+/u.exec(String(head.value))?.[0].length ?? 0;
        if (lead > 0 && lead < String(head.value).length) {
          head.value = String(head.value).slice(lead);
          head.position = {
            start: pointAt(doc, head.position.start.offset + lead),
            end: head.position.end,
          };
        }
      }
      // A line ending that closes the paragraph breaks nothing (CommonMark: "neither syntax for
      // hard line breaks works at the end of a paragraph"); the soft-break reader still sees
      // one before trailing whitespace, as in `> foo` / `>  `.
      while (children[children.length - 1]?.type === "break") children.pop();
      return [{ type: "paragraph", children, position }];
    }
    default: {
      const { position: _p, children: _c, ...rest } = node;
      const out: Node8 = { ...rest, position } as Node8;
      if (node.children) out.children = kids();
      return [out];
    }
  }
}

/**
 * A child never ends after its parent. Pulling a definition's end back to its last content
 * line leaves a final block child (a comment, html or math) ending at column 1 of the next
 * line; it takes the same end, which is the same pull-back applied one level down.
 */
function clampToParent(node: Node8): void {
  for (const child of node.children ?? []) {
    if (node.position && child.position.end.offset > node.position.end.offset) {
      child.position.end = { ...node.position.end };
    }
    clampToParent(child);
  }
}

/**
 * remark-parse 8 reads `\r\n` as `\n`, which moves every later offset; Obsidian reports them in
 * the original text, so each is moved back. A lone `\r` keeps its length and needs nothing.
 */
function restoreCrlf(node: Node8, crlf: readonly number[]): void {
  const shift = (offset: number): number => {
    let low = 0;
    let high = crlf.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (crlf[mid]! < offset) low = mid + 1;
      else high = mid;
    }
    return offset + low;
  };
  if (node.position) {
    node.position.start.offset = shift(node.position.start.offset);
    node.position.end.offset = shift(node.position.end.offset);
  }
  for (const child of node.children ?? []) restoreCrlf(child, crlf);
}

export function parseLegacy8(input: string, options: LegacyOptions): Root {
  const source = input.startsWith("\uFEFF") ? input.slice(1) : input;
  const crlf: number[] = [];
  for (
    let at = source.indexOf("\r\n");
    at !== -1;
    at = source.indexOf("\r\n", at + 2)
  ) {
    crlf.push(at - crlf.length);
  }
  const doc = source.replace(/\r\n?/g, "\n");
  const { tree, offsets } = parse8WithOffsets(doc, options);
  const definitions = new Set<string>();
  const footnotes = new Set<string>();
  collectDefinitions(tree, definitions, footnotes);
  const root = convert(
    tree,
    { doc, definitions, footnotes, options },
    false,
  )[0]!;
  mergeText(root);
  clampToParent(root);
  if (options.lineOffsets) root.data = { lineOffsets: offsets };
  if (options.math) mathDisplayTransform(root as unknown as Root, doc);
  if (crlf.length > 0) restoreCrlf(root, crlf);
  return root as unknown as Root;
}
