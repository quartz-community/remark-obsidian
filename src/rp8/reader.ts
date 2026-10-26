/**
 * PROTOTYPE: legacy parsing on remark-parse 8, Obsidian's own parser lineage.
 *
 * The readers below are ported from `obsidian-footnotes` (MIT, Copyright (c) 2021-2026 Alexis
 * Rondeau, Micha Brugger, Jason Qin, and contributors), `src/parsing/obsidian-markdown.ts`,
 * whose test suite asserts agreement with every recorded answer this package's referee reads
 * except four P1/P2 cache-bug documents. Each reader carries the rule letter it has in that
 * project's `docs/obsidian-reading-rules.md`. Left out: their speed-only wrappers and the
 * link-definition-at-end probe, which only matters when a note is parsed in parts.
 */
import { createRequire } from "node:module";

import { legacyHighlightQueue } from "../lib/syntax/highlight.js";

const require = createRequire(import.meta.url);

const remarkParse8: any = require("remarkParse8");
const remarkFootnotes2: any = require("remarkFootnotes2");
const remarkMath3: any = require("remarkMath3");
const listTokenizer: any = require("./list.cjs");

export interface Point8 {
  line: number;
  column: number;
  offset: number;
}

export interface Node8 {
  type: string;
  position: { start: Point8; end: Point8 };
  children?: Node8[];
  [key: string]: unknown;
}

type Tokenizer = ((
  this: any,
  eat: any,
  value: string,
  silent?: boolean,
) => any) & {
  locator?: (value: string, fromIndex: number) => number;
};

function along(point: Point8, columns: number): Point8 {
  return {
    line: point.line,
    column: point.column + columns,
    offset: point.offset + columns,
  };
}

function lineEnd(value: string, from: number): number {
  const end = value.indexOf("\n", from);
  return end === -1 ? value.length : end;
}

/** `%%` comments (F1-F5, D5). */
function percentComments(tables: any): void {
  const block: Tokenizer = function (eat, value, silent) {
    let start = 0;
    while (value.charCodeAt(start) === 32) start++;
    if (!value.startsWith("%%", start)) return undefined;
    const openerEnd = lineEnd(value, start);
    if (value.slice(start + 2, openerEnd).includes("%")) return undefined;
    if (silent === true) return true;
    const close =
      openerEnd === value.length ? -1 : value.indexOf("%%", openerEnd);
    const innerEnd = close === -1 ? value.length : close;
    const children = this.tokenizeInline(
      value.slice(start + 2, innerEnd),
      along(eat.now(), start + 2),
    );
    const comment = eat(
      value.slice(0, close === -1 ? value.length : close + 2),
    )({
      type: "percentComment",
      block: true,
      children,
    });
    if (
      close !== -1 &&
      value.slice(close + 2, lineEnd(value, close)).trim() !== ""
    ) {
      const line = comment.position.end.line;
      this.offset[line] =
        (this.offset[line] ?? 0) +
        close +
        2 -
        (value.lastIndexOf("\n", close) + 1);
    }
    return comment;
  };
  const inline: Tokenizer = function (eat, value, silent) {
    if (!value.startsWith("%%")) return undefined;
    const close = value.indexOf("%%", 2);
    if (close === -1 || close > lineEnd(value, 0)) return undefined;
    if (silent === true) return true;
    const children = this.tokenizeInline(
      value.slice(2, close),
      along(eat.now(), 2),
    );
    return eat(value.slice(0, close + 2))({
      type: "percentComment",
      block: false,
      children,
    });
  };
  inline.locator = (value, fromIndex) => value.indexOf("%%", fromIndex);
  tables.blockTokenizers.percentComment = block;
  tables.inlineTokenizers.percentComment = inline;
  tables.blockMethods.splice(
    tables.blockMethods.indexOf("fencedCode"),
    0,
    "percentComment",
  );
  tables.inlineMethods.splice(
    tables.inlineMethods.indexOf("html"),
    0,
    "percentComment",
  );
  tables.interruptParagraph.push(["percentComment"]);
  tables.interruptList.push(["percentComment"]);
  tables.interruptBlockquote.push(["percentComment"]);
}

const CalloutMarker = /^\[![^\]\n]+\][+-]?(?=[ \t\n]|$)/;

/** Callout titles (A1-A5). */
function calloutTitles(tables: any): void {
  const stockBlockquote: Tokenizer = tables.blockTokenizers.blockquote;
  tables.blockTokenizers.blockquote = function (
    eat: any,
    value: string,
    silent?: boolean,
  ) {
    if (silent !== true) {
      let i = 0;
      while (value[i] === " " || value[i] === "\t") i++;
      if (value[i] === ">") {
        i++;
        if (value[i] === " ") i++;
        this.calloutAt = eat.now().offset + i;
      }
    }
    return stockBlockquote.call(this, eat, value, silent);
  } as Tokenizer;
  tables.blockTokenizers.calloutTitle = function (
    eat: any,
    value: string,
    silent?: boolean,
  ) {
    if (eat.now().offset !== this.calloutAt) return undefined;
    const marker = CalloutMarker.exec(value);
    if (!marker) return undefined;
    if (silent === true) return true;
    const line = value.slice(0, lineEnd(value, 0));
    let rest = marker[0].length;
    if (line[rest] === " " || line[rest] === "\t") rest++;
    const now = eat.now();
    this.offset[now.line] = Math.max(
      this.offset[now.line] ?? 0,
      now.column - 1 + rest,
    );
    const children = this.tokenizeBlock(line.slice(rest), along(now, rest));
    return eat(line)({ type: "calloutTitle", marker: marker[0], children });
  } as Tokenizer;
  tables.blockMethods.unshift("calloutTitle");
}

function startsWithPipe(line: string): boolean {
  return line.startsWith("|");
}

function isTableRow(line: string, piped: boolean): boolean {
  if (piped)
    return (
      startsWithPipe(line) && line.indexOf("|", line.indexOf("|") + 1) !== -1
    );
  return !startsWithPipe(line) && line.includes("|");
}

function tableEnd(value: string): number {
  const headerEnd = lineEnd(value, 0);
  if (headerEnd === value.length || !value.slice(0, headerEnd).includes("|"))
    return -1;
  const piped = startsWithPipe(value);
  const delimiterEnd = lineEnd(value, headerEnd + 1);
  if (startsWithPipe(value.slice(headerEnd + 1, delimiterEnd)) !== piped)
    return -1;
  let end = delimiterEnd;
  while (end < value.length) {
    const rowEnd = lineEnd(value, end + 1);
    if (!isTableRow(value.slice(end + 1, rowEnd), piped)) break;
    end = rowEnd;
  }
  return end;
}

/** Tables (C1-C3). */
function tablePipeStyles(tables: any): void {
  const stockTable: Tokenizer = tables.blockTokenizers.table;
  tables.blockTokenizers.table = function (
    eat: any,
    value: string,
    silent?: boolean,
  ) {
    const end = tableEnd(value);
    if (end === -1) return undefined;
    return stockTable.call(this, eat, value.slice(0, end), silent);
  } as Tokenizer;
}

const Wikilink = /^!?\[\[(?:(?!\[\[)[^\n])+?\]\]/;

/** Wikilinks and embeds (D1). */
function wikilinks(tables: any): void {
  const wikilink: Tokenizer = function (eat, value, silent) {
    const match = Wikilink.exec(value);
    if (!match) return undefined;
    if (silent === true) return true;
    return eat(match[0])({ type: "wikiLink", value: match[0] });
  };
  wikilink.locator = (value, fromIndex) => {
    const at = value.indexOf("[[", fromIndex);
    return at > fromIndex && value[at - 1] === "!" ? at - 1 : at;
  };
  tables.inlineTokenizers.wikiLink = wikilink;
  tables.inlineMethods.splice(
    tables.inlineMethods.indexOf("link"),
    0,
    "wikiLink",
  );
}

const Frontmatter = /^---\n(?:[^\n]*\n)*?---/;

/** Frontmatter (D2). */
function frontmatter(tables: any): void {
  tables.blockTokenizers.frontmatter = function (
    eat: any,
    value: string,
    silent?: boolean,
  ) {
    const noteStart = this.file.toString().charCodeAt(0) === 0xfeff ? 1 : 0;
    if (eat.now().offset !== noteStart) return undefined;
    const match = Frontmatter.exec(value);
    if (!match) return undefined;
    if (silent === true) return true;
    const yaml = eat(match[0])({ type: "yaml", value: match[0] });
    if (
      value.slice(match[0].length, lineEnd(value, match[0].length)).trim() !==
      ""
    ) {
      const line = yaml.position.end.line;
      this.offset[line] = (this.offset[line] ?? 0) + "---".length;
    }
    return yaml;
  } as Tokenizer;
  tables.blockMethods.unshift("frontmatter");
}

/** `$$`, a body that may be empty, and the first `$$` not escaped by a backslash. */
const DoubleDollarMath = /^\$\$(?:|[\s\S]*?[^\\])\$\$/;

/** `$$ … $$` inside a paragraph (M1). */
function doubleDollarMath(tables: any): void {
  const math: Tokenizer = function (eat, value, silent) {
    const match = DoubleDollarMath.exec(value);
    if (!match) return undefined;
    if (silent === true) return true;
    return eat(match[0])({ type: "inlineMath", value: match[0].slice(2, -2) });
  };
  math.locator = (value, fromIndex) => value.indexOf("$$", fromIndex);
  tables.inlineTokenizers.doubleDollarMath = math;
  tables.inlineMethods.splice(
    tables.inlineMethods.indexOf("math"),
    0,
    "doubleDollarMath",
  );
}

/** `==highlight==`, by the rule `legacyHighlightQueue` records (measured against Obsidian). */
function highlights(tables: any): void {
  const highlight: Tokenizer = function (eat, value, silent) {
    const body = legacyHighlightQueue(value);
    if (body === null) return undefined;
    if (silent === true) return true;
    const now = eat.now();
    return eat(`==${body}==`)({
      type: "highlight",
      children: this.tokenizeInline(body, along(now, 2)),
    });
  };
  highlight.locator = (value, fromIndex) => value.indexOf("==", fromIndex);
  tables.inlineTokenizers.highlight = highlight;
  tables.inlineMethods.splice(
    tables.inlineMethods.indexOf("deletion") + 1,
    0,
    "highlight",
  );
}

const TAG_CHAR = /[\p{L}\p{M}\p{Emoji}\p{N}_\-/]/u;

/**
 * `#tag`. The locator offers only a `#` after whitespace or another `#`, and the reader runs
 * wherever the inline loop stands -- which is also right after any construct, so
 * `a**b**#next` tags while `foo#next` does not.
 */
function tags(tables: any): void {
  const tag: Tokenizer = function (eat, value, silent) {
    if (value.charAt(0) !== "#") return undefined;
    let end = 1;
    let nonDigit = false;
    for (const ch of value.slice(1)) {
      if (ch === "#" || ch === "*" || !TAG_CHAR.test(ch)) break;
      if (!/[0-9]/u.test(ch)) nonDigit = true;
      end += ch.length;
    }
    if (end === 1 || !nonDigit) return undefined;
    if (silent === true) return true;
    return eat(value.slice(0, end))({
      type: "tag",
      value: value.slice(1, end),
    });
  };
  tag.locator = (value, fromIndex) => {
    for (
      let at = value.indexOf("#", fromIndex);
      at !== -1;
      at = value.indexOf("#", at + 1)
    ) {
      const before = value.charAt(at - 1);
      if (at === 0 || before === "#" || /\s/u.test(before)) return at;
    }
    return -1;
  };
  tables.inlineTokenizers.tag = tag;
  tables.inlineMethods.splice(tables.inlineMethods.indexOf("text"), 0, "tag");
}

/** A line ending inside a paragraph is a break (Obsidian's default, remark-breaks 2's reader). */
function softBreaks(tables: any): void {
  const softBreak: Tokenizer = function (eat, value, silent) {
    let queue = "";
    for (const character of value) {
      if (character === "\n") {
        if (silent === true) return true;
        const indent = /^[ \t]*/u.exec(value.slice(queue.length + 1))![0];
        return eat(queue + character + indent)({ type: "break" });
      }
      if (character !== " ") return undefined;
      queue += character;
    }
    return undefined;
  };
  softBreak.locator = (value, fromIndex) => {
    let at = value.indexOf("\n", fromIndex);
    while (at > fromIndex && value.charAt(at - 1) === " ") at--;
    return at;
  };
  tables.inlineTokenizers.break = softBreak;
}

/**
 * Order matters once: remark-footnotes builds the definition's interrupt list from the block
 * readers registered when it attaches, so math before it (a `$$` line ends a definition, E1)
 * and Obsidian's readers after it (a `%%` line does not, D5).
 */
function buildParser(): any {
  const Stock = remarkParse8.Parser;
  class ObsidianParser extends Stock {}
  const tables: any = ObsidianParser.prototype;
  tables.options = { ...tables.options, commonmark: true };
  tables.blockTokenizers = { ...tables.blockTokenizers };
  tables.inlineTokenizers = { ...tables.inlineTokenizers };
  tables.blockMethods = tables.blockMethods.slice();
  tables.inlineMethods = tables.inlineMethods.slice();
  tables.interruptParagraph = tables.interruptParagraph.slice();
  tables.interruptList = tables.interruptList.slice();
  tables.interruptBlockquote = tables.interruptBlockquote.slice();

  const host = { Parser: ObsidianParser };
  (remarkMath3.default ?? remarkMath3).call(host, {});
  (remarkFootnotes2.default ?? remarkFootnotes2).call(host, {
    inlineNotes: true,
  });

  percentComments(tables);
  calloutTitles(tables);
  tables.blockTokenizers.list = listTokenizer;
  tablePipeStyles(tables);
  wikilinks(tables);
  frontmatter(tables);
  doubleDollarMath(tables);
  highlights(tables);
  tags(tables);
  softBreaks(tables);
  return ObsidianParser;
}

let parserClass: any;

/** Parse `doc` (line breaks already `\n`) the way Obsidian reads it. */
export function parse8(doc: string): Node8 {
  return parse8WithOffsets(doc).tree;
}

/** The tree with remark-parse 8's per-line container offset table. */
export function parse8WithOffsets(doc: string): {
  tree: Node8;
  offsets: Record<number, number>;
} {
  parserClass ??= buildParser();
  const file = {
    toString: () => doc,
    message: () => undefined,
    fail: (error: Error) => {
      throw error;
    },
  };
  const parser = new parserClass(doc, file);
  const tree = parser.parse() as Node8;
  return { tree, offsets: { ...parser.offset } };
}
