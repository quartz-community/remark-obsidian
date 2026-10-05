import type { CompileContext, Extension } from "mdast-util-from-markdown";
import type { Token } from "micromark-util-types";
import type { Root } from "mdast";

/**
 * The composite container prefixes, and only those.
 *
 * Each one already spans its own parts -- `blockQuotePrefix` covers the `>` and
 * the space after it, `listItemPrefix` the marker and its space -- so taking
 * the parts as well would measure the same characters twice.
 *
 * `linePrefix` is deliberately absent. It fires for ordinary indentation too,
 * and indenting a paragraph at the top level is content, not a container, so
 * counting it would report an offset for a line no container owns.
 */
const PREFIXES = ["blockQuotePrefix", "listItemPrefix", "listItemIndent"];

/**
 * Record how many characters each line's containers consume.
 *
 * `remark-parse@8` kept this as its `offset` table and Obsidian's own parser
 * still does, because it is what turns a column inside a stripped line back
 * into a column in the file. A consumer reproducing Obsidian's reported
 * positions needs the same table: inside `> - a`, the `a` is at column 5 of the
 * line but column 1 of the content, and no node position records the four
 * characters in between for a *continuation* line, which carries the prefix
 * again without starting any node.
 *
 * Taken from micromark's own tokens rather than re-derived by matching
 * prefixes against each line. The tokenizer has already decided what the
 * containers are -- whether a `>` opens a quote, how wide a list marker's
 * indent is, whether a line is lazy -- and a second lexical pass would be
 * guessing at those same decisions.
 *
 * Written onto the root node through `this.stack[0]`, so the table belongs to
 * the parse that produced it; an extension is created once per processor and
 * must hold no state of its own.
 */
/**
 * Start the table, so that having the option on is what decides whether the
 * field exists.
 *
 * The handlers below only fire where a container does, so a document with none
 * would otherwise leave the field missing -- indistinguishable from the option
 * being off, and a consumer cannot tell "no containers" from "not recorded".
 */
export function ensureLineOffsets(tree: Root): void {
  const data = (tree.data ??= {});
  data.lineOffsets ??= {};
}

export function lineOffsetsFromMarkdown(): Extension {
  function record(this: CompileContext, token: Token): void {
    const root = this.stack[0] as Root;
    const data = (root.data ??= {});
    const offsets = (data.lineOffsets ??= {});
    const line = token.end.line;
    const consumed = token.end.column - 1;
    // Nested containers each contribute a prefix on the same line, so the
    // widest one is the point where content begins: `>> deep` ends at 3, not
    // the 1 of the outer quote alone.
    if (consumed > (offsets[line] ?? 0)) offsets[line] = consumed;
  }

  return {
    exit: Object.fromEntries(PREFIXES.map((type) => [type, record])),
  };
}
