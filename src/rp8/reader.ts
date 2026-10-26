/**
 * The `legacy` reader: remark-parse 8, the parser Obsidian forks, with Obsidian's readers added.
 *
 * remark-parse 8.0.3, remark-footnotes 2.0.0 and remark-math 3.0.1 are vendored in `./vendor`
 * (see its README); nothing here reaches `node_modules` at run time. The readers below are ported from `obsidian-footnotes` (MIT, Copyright (c) 2021-2026 Alexis
 * Rondeau, Micha Brugger, Jason Qin, and contributors), `src/parsing/obsidian-markdown.ts`,
 * whose test suite asserts agreement with every recorded answer this package's referee reads
 * except four P1/P2 cache-bug documents. Each reader carries the rule letter it has in that
 * project's `docs/obsidian-reading-rules.md`. Left out: their speed-only wrappers and the
 * link-definition-at-end probe, which only matters when a note is parsed in parts.
 */
import { legacyHighlightQueue } from "../lib/syntax/highlight.js";
import listTokenizer from "./list.js";
import remarkFootnotes2 from "./vendor/remark-footnotes/index.js";
import remarkMath3 from "./vendor/remark-math/index.js";
import Parser8 from "./vendor/remark-parse/parser.js";

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
 * SPEED-UPS, none of which changes a reading -- `test/rp8-speedups.test.ts` parses every corpus
 * document with and without them and requires identical trees.
 *
 * remark-parse 8's inline loop is superlinear in two places a vault note can reach. The text
 * reader asks every inline reader where it could next match, at every token boundary, and each
 * answer scans forward: on a long line with nothing to find, that is quadratic. And a code-span
 * opener with no closer of its width scans to the end of the run, after which the text reader
 * advances ONE backtick and the shorter opener scans again -- `backtick-increasing` at 500 took
 * 51 s. Both answers are functions of the run's text alone, so each is computed once per run:
 *
 * - every `tokenizeInline` call pushes its content, so a reader knows where `value` sits in it;
 * - a locator's answer is kept and reused for any later position up to that answer (every
 *   locator here finds the first match at or after where it is asked, which is what makes a
 *   remembered answer exact -- `break` and `email` walk back, but never past that point);
 * - the code span's closer is "the first maximal backtick run of the opener's width after it",
 *   looked up in an index of the run's backtick runs; a found span is still read by the stock
 *   reader, whose scan is then bounded by the span it consumes.
 */
interface Frame {
  value: string;
  /** Per inline reader, by its index in `inlineMethods`: where its locator was asked, and its answer. */
  askedAt: Int32Array;
  answer: Int32Array;
  runs?: Map<number, number[]>;
  /** For each offset, the first offset at or after it whose character `test` accepts, or -1. */
  next: Map<string, Int32Array>;
  /** For each offset `i`, the first `j > i` whose bracket balance is below balance(i), or -1. */
  lower?: Int32Array;
  /** For each offset, the first backtick at or after it that could open a code span, or -1. */
  spanCapable?: Int32Array;
}

/**
 * `frame.spanCapable`: a code span opened at `q` needs a LATER backtick run of exactly the
 * opener's width, `runEnd(q) - q`. Where every later run is wider than that, no opener from `q` to
 * its run's end can succeed, so those backticks are skipped. (A narrower or equal later run keeps
 * them -- only a sure decline is skipped, never a possible span.)
 */
function spanCapable(frame: Frame): Int32Array {
  if (!frame.spanCapable) {
    const { value } = frame;
    const table = new Int32Array(value.length + 1).fill(-1);
    let narrowestLater = Infinity;
    for (let at = value.length - 1; at >= 0;) {
      if (value.charCodeAt(at) !== 96) {
        table[at] = table[at + 1]!;
        at--;
        continue;
      }
      const runEnd = at + 1;
      let runStart = at;
      while (runStart > 0 && value.charCodeAt(runStart - 1) === 96) runStart--;
      for (let q = runEnd - 1; q >= runStart; q--) {
        table[q] = narrowestLater <= runEnd - q ? q : table[q + 1]!;
      }
      narrowestLater = Math.min(narrowestLater, runEnd - runStart);
      at = runStart - 1;
    }
    frame.spanCapable = table;
  }
  return frame.spanCapable;
}

/** `frame.next` for one character class, built once per run. */
function nextWhere(
  frame: Frame,
  key: string,
  test: (value: string, at: number) => boolean,
): Int32Array {
  let table = frame.next.get(key);
  if (!table) {
    const { value } = frame;
    table = new Int32Array(value.length + 1);
    let next = -1;
    table[value.length] = -1;
    for (let at = value.length - 1; at >= 0; at--) {
      if (test(value, at)) next = at;
      table[at] = next;
    }
    frame.next.set(key, table);
  }
  return table;
}

/**
 * Where the `[` at `open` closes, by remark-parse 8's link and reference text scans in GFM mode:
 * a backslash skips the next character, every other `[` and `]` counts, code included. The
 * closer is the first `]` that takes the balance below the opener's, found from a table of
 * "first later offset with a lower balance". Escapes are computed once from the run's start,
 * which agrees with a scan started after any `[`: a backslash run never straddles one.
 */
function closingBracket(frame: Frame, open: number): number {
  if (!frame.lower) {
    const { value } = frame;
    // balance[i]: unescaped `[` minus unescaped `]` in value[0, i).
    const balance = new Int32Array(value.length + 1);
    for (let at = 0, level = 0; at < value.length; at++) {
      const code = value.charCodeAt(at);
      balance[at] = level;
      if (code === 92 && at + 1 < value.length) {
        balance[at + 1] = level;
        at++;
      } else if (code === 91) level++;
      else if (code === 93) level--;
      balance[at + 1] = level;
    }
    const lower = new Int32Array(value.length + 1).fill(-1);
    const stack: number[] = [];
    for (let at = 0; at <= value.length; at++) {
      while (
        stack.length > 0 &&
        balance[at]! < balance[stack[stack.length - 1]!]!
      ) {
        lower[stack.pop()!] = at;
      }
      stack.push(at);
    }
    frame.lower = lower;
  }
  // The balance just after the opener is the scan's depth 0; the closer is the `]` before the
  // first offset where it is lower.
  const after = frame.lower[open + 1];
  return after === undefined || after === -1 ? -1 : after - 1;
}

/** The innermost `tokenizeInline` content, if `value` is its tail; otherwise none. */
function frameOf(state: any, value: string): Frame | undefined {
  const frames: Frame[] | undefined = state.inlineFrames;
  const frame = frames?.[frames.length - 1];
  if (!frame || value.length > frame.value.length || value.length === 0)
    return undefined;
  const base = frame.value.length - value.length;
  return frame.value.charCodeAt(base) === value.charCodeAt(0) &&
    frame.value.charCodeAt(frame.value.length - 1) ===
      value.charCodeAt(value.length - 1)
    ? frame
    : undefined;
}

function speedUps(tables: any, features: Features): void {
  const stockInline = tables.tokenizeInline;
  tables.tokenizeInline = function (value: string, now: Point8) {
    const frames: Frame[] = (this.inlineFrames ??= []);
    const count = (this.inlineMethods as string[]).length;
    frames.push({
      value,
      askedAt: new Int32Array(count).fill(-1),
      answer: new Int32Array(count),
      next: new Map(),
    });
    try {
      return stockInline.call(this, value, now);
    } finally {
      frames.pop();
    }
  };

  const stockText: Tokenizer = tables.inlineTokenizers.text;
  // remark-parse 8's own text reader, with each locator's answer remembered per run.
  const text: Tokenizer = function (eat, value, silent) {
    const frame = frameOf(this, value);
    if (silent === true || !frame)
      return stockText.call(this, eat, value, silent);
    const base = frame.value.length - value.length;
    const from = base + 1;
    let min = value.length;
    const methods = this.inlineMethods as string[];
    if (frame.askedAt.length !== methods.length)
      return stockText.call(this, eat, value, silent);
    for (let index = 0; index < methods.length; index++) {
      const name = methods[index]!;
      const reader = this.inlineTokenizers[name] as Tokenizer | undefined;
      if (name === "text" || !reader) continue;
      if (!reader.locator) return stockText.call(this, eat, value, silent);
      const asked = frame.askedAt[index]!;
      let at = frame.answer[index]!;
      if (asked === -1 || asked > from || (at !== -1 && at < from)) {
        const position = reader.locator.call(this, value, 1);
        at = position === -1 ? -1 : base + position;
        // The code locator's next backtick, moved on to the next one a span could open at.
        if (name === "code" && at !== -1) at = spanCapable(frame)[at]!;
        frame.askedAt[index] = from;
        frame.answer[index] = at;
      }
      if (at !== -1 && at - base < min) min = at - base;
    }
    const subvalue = value.slice(0, min);
    this.decode(
      subvalue,
      eat.now(),
      (content: string, _p: unknown, source: string) => {
        eat(source || content)({ type: "text", value: content });
      },
    );
    return undefined;
  };
  tables.inlineTokenizers.text = text;

  const stockCode: Tokenizer = tables.inlineTokenizers.code;
  const code: Tokenizer = function (eat, value, silent) {
    const frame = frameOf(this, value);
    if (!frame || value.charCodeAt(0) !== 96)
      return stockCode.call(this, eat, value, silent);
    const base = frame.value.length - value.length;
    // The opener is the rest of this backtick run; counting it here would be quadratic per run.
    const runEnd = nextWhere(
      frame,
      "not-backtick",
      (v, i) => v.charCodeAt(i) !== 96,
    )[base]!;
    if (runEnd === -1) return undefined;
    const width = runEnd - base;
    const starts = (frame.runs ??= backtickRuns(frame.value)).get(width);
    // No run of the opener's width after it: the stock reader scans to the end and declines.
    if (!starts || starts[starts.length - 1]! < base + width) return undefined;
    return stockCode.call(this, eat, value, silent);
  };
  code.locator = stockCode.locator;
  tables.inlineTokenizers.code = code;

  // Readers that scan forward from an opener for something the run may not hold. Each wrapper
  // returns early ONLY where the stock reader is certain to decline, by its own rules, and
  // otherwise hands over -- so an early return can never change a reading.
  const precheck = (
    name: string,
    declines: (frame: Frame, base: number, value: string) => boolean,
  ) => {
    const stock: Tokenizer | undefined = tables.inlineTokenizers[name];
    // Loud, not skipped: a wrapper on a name nothing registers is an inert speed-up.
    if (!stock) throw new Error(`No inline reader named ${name} to speed up`);
    const wrapped: Tokenizer = function (eat, value, silent) {
      const frame = frameOf(this, value);
      if (frame && declines(frame, frame.value.length - value.length, value))
        return undefined;
      return stock.call(this, eat, value, silent);
    };
    wrapped.locator = stock.locator;
    for (const key of ["onlyAtStart", "notInList", "notInBlock", "notInLink"]) {
      if (key in stock) (wrapped as any)[key] = (stock as any)[key];
    }
    tables.inlineTokenizers[name] = wrapped;
  };
  const isSpace = (value: string, at: number) => /\s/.test(value.charAt(at));

  // `[text](dest)` and `![alt](dest)`: no closing `]`, a closing `]` with no `(` after it, or an
  // angle destination with no `>` (or, in CommonMark mode, a line ending before it).
  precheck("link", (frame, base, value) => {
    const open = base + (value.charCodeAt(0) === 33 ? 1 : 0);
    if (frame.value.charCodeAt(open) !== 91) return false;
    const close = closingBracket(frame, open);
    if (close === -1) return true;
    if (frame.value.charCodeAt(close + 1) !== 40) return true;
    let at = close + 2;
    while (at < frame.value.length && isSpace(frame.value, at)) at++;
    if (frame.value.charCodeAt(at) !== 60) return false;
    const gt = nextWhere(frame, ">", (v, i) => v.charCodeAt(i) === 62)[at + 1]!;
    const lf = nextWhere(frame, "\n", (v, i) => v.charCodeAt(i) === 10)[
      at + 1
    ]!;
    return gt === -1 || (lf !== -1 && lf < gt);
  });
  // `[text]`, `[text][label]`, `[text][]`: no closing `]` for the text.
  precheck("reference", (frame, base, value) => {
    const open = base + (value.charCodeAt(0) === 33 ? 1 : 0);
    return (
      frame.value.charCodeAt(open) === 91 && closingBracket(frame, open) === -1
    );
  });
  // `[^label]`: the label ends at the first space, tab, line ending or `]`, and only `]` keeps it.
  precheck("footnoteCall", (frame, base, value) => {
    if (value.charCodeAt(0) !== 91 || value.charCodeAt(1) !== 94) return false;
    const stop = nextWhere(frame, "label-stop", (v, i) => {
      const c = v.charCodeAt(i);
      return c === 32 || c === 9 || c === 10 || c === 93;
    })[base + 2]!;
    return stop === -1 || frame.value.charCodeAt(stop) !== 93;
  });
  // `^[note]` (remark-footnotes' `inlineNote`): it needs some `]` after it, whatever its own
  // rules for code and escapes.
  if (features.inlineFootnotes) {
    precheck("inlineNote", (frame, base, value) => {
      if (value.charCodeAt(0) !== 94 || value.charCodeAt(1) !== 91)
        return false;
      return (
        nextWhere(frame, "]", (v, i) => v.charCodeAt(i) === 93)[base + 2] === -1
      );
    });
  }
  // `<scheme://...>` and `<user@host>`: the first space, `>`, `@` or `:/` decides the kind, and
  // the rest must reach a `>` before the next space.
  precheck("autoLink", (frame, base, value) => {
    if (value.charCodeAt(0) !== 60) return false;
    const stop = nextWhere(frame, "autolink-stop", (v, i) => {
      const c = v.charCodeAt(i);
      return (
        c === 62 ||
        c === 64 ||
        (c === 58 && v.charCodeAt(i + 1) === 47) ||
        isSpace(v, i)
      );
    })[base + 1]!;
    if (stop === -1 || stop === base + 1) return true;
    const c = frame.value.charCodeAt(stop);
    const rest = c === 64 ? stop + 1 : c === 58 ? stop + 2 : -1;
    if (rest === -1) return true;
    const end = nextWhere(
      frame,
      "space-or-gt",
      (v, i) => v.charCodeAt(i) === 62 || isSpace(v, i),
    )[rest]!;
    return end === -1 || end === rest || frame.value.charCodeAt(end) !== 62;
  });
}

/** Every maximal run of backticks in `value`, as width -> ascending start offsets. */
function backtickRuns(value: string): Map<number, number[]> {
  const runs = new Map<number, number[]>();
  for (let at = value.indexOf("`"); at !== -1;) {
    let end = at;
    while (value.charCodeAt(end) === 96) end++;
    const width = end - at;
    let list = runs.get(width);
    if (!list) runs.set(width, (list = []));
    list.push(at);
    at = value.indexOf("`", end);
  }
  return runs;
}

/** Which of Obsidian's readers to register; the rest of the parser is remark-parse 8 as is. */
export interface Features {
  comments: boolean;
  callouts: boolean;
  wikilinks: boolean;
  frontmatter: boolean;
  math: boolean;
  highlights: boolean;
  tags: boolean;
  inlineFootnotes: boolean;
  customTaskChars: boolean;
  positionedBreaks: boolean;
}

/**
 * Order matters once: remark-footnotes builds the definition's interrupt list from the block
 * readers registered when it attaches, so math before it (a `$$` line ends a definition, E1)
 * and Obsidian's readers after it (a `%%` line does not, D5).
 */
function buildParser(features: Features, fast: boolean): any {
  const Stock: any = Parser8;
  class ObsidianParser extends Stock {}
  const tables: any = ObsidianParser.prototype;
  tables.options = { ...tables.options, commonmark: true };
  // Not in `options`: remark-parse 8's `setOptions` keeps only the keys it knows.
  tables.anyTaskChar = features.customTaskChars;
  tables.blockTokenizers = { ...tables.blockTokenizers };
  tables.inlineTokenizers = { ...tables.inlineTokenizers };
  tables.blockMethods = tables.blockMethods.slice();
  tables.inlineMethods = tables.inlineMethods.slice();
  tables.interruptParagraph = tables.interruptParagraph.slice();
  tables.interruptList = tables.interruptList.slice();
  tables.interruptBlockquote = tables.interruptBlockquote.slice();

  const host = { Parser: ObsidianParser };
  if (features.math) (remarkMath3 as any).call(host, {});
  (remarkFootnotes2 as any).call(host, {
    inlineNotes: features.inlineFootnotes,
  });

  if (features.comments) percentComments(tables);
  if (features.callouts) calloutTitles(tables);
  tables.blockTokenizers.list = listTokenizer;
  tablePipeStyles(tables);
  if (features.wikilinks) wikilinks(tables);
  if (features.frontmatter) frontmatter(tables);
  if (features.math) doubleDollarMath(tables);
  if (features.highlights) highlights(tables);
  if (features.tags) tags(tables);
  if (features.positionedBreaks) softBreaks(tables);
  if (fast) speedUps(tables, features);
  return ObsidianParser;
}

const parserClasses = new Map<string, any>();

/** The tree with remark-parse 8's per-line container offset table. */
export function parse8WithOffsets(
  doc: string,
  features: Features,
  fast = true,
): { tree: Node8; offsets: Record<number, number> } {
  const key = JSON.stringify(features) + String(fast);
  let parserClass = parserClasses.get(key);
  if (parserClass === undefined) {
    parserClass = buildParser(features, fast);
    parserClasses.set(key, parserClass);
  }
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
