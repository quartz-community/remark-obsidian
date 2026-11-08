/**
 * `root.data.readsPastEnd`: whether a top-level link definition would read differently with more
 * lines after the end of this text, which matters only to a note parsed in parts.
 *
 * A link definition is the one block remark-parse 8 reads past the line after it. Its label runs
 * to the first `]` over blank lines too, line breaks may come before the destination, a
 * destination in `<...>` may hold them, and a title may start after blank lines and run over
 * several lines (`vendor/remark-parse/tokenize/definition.ts`). So a cut at a block boundary can
 * change the reading of the lines above it, in two ways:
 *
 * - **The reader declined, and more text would complete a definition.** `[a]: x "t` is a paragraph
 *   alone, and a definition once a later line closes the title. The block loop is not the only
 *   one asking: a footnote definition asks at each of its lines whether a definition ends it, so
 *   `[^1]: d` / `[` reads differently above `]: x` with no paragraph or table in sight. So this
 *   watches the reader rather than the tree.
 * - **The reader took a definition with no title, and more text would undo it.** `[foo]: /url` is
 *   a definition alone, and a paragraph above `'tit` / blank line, where the title never closes.
 *   A definition with a closed title has nothing left to read.
 *
 * Answering yes when nothing would change costs a caller only a longer part, never a wrong
 * reading, so the scan need not ask what the later text is. It assumes the text ends at a line's
 * end, which a block boundary is, and reads a label, destination and title in the reader's order.
 *
 * Ported from `obsidian-footnotes` (MIT), `src/parsing/obsidian-markdown.ts`, as `reader.ts` is:
 * the scan from `definitionCutOffByTheEnd`, the wrapper from `linkDefinitionsAtTheEnd` before
 * that project's 681a223. The second case is new here: that project always parses a part with
 * the next line attached, so it never ends one on a bare definition.
 */
import type { Node8 } from "./reader.js";

/** Whether a definition starting at `from` would be taken if the text went on, though it is not now. */
function definitionCutOff(doc: string, from: number): boolean {
  const length = doc.length;
  const skip = (start: number, set: string): number => {
    let at = start;
    while (at < length && set.includes(doc[at]!)) at++;
    return at;
  };
  let at = skip(from, " \t");
  // A `[^` is left to the footnote readers.
  if (doc[at] !== "[" || doc[at + 1] === "^") return false;
  const labelStart = ++at;
  while (at < length && doc[at] !== "]") at += doc[at] === "\\" ? 2 : 1;
  if (at >= length) return true;
  if (at === labelStart || doc[at + 1] !== ":") return false;
  at = skip(at + 2, " \t\n");
  if (at >= length) return true;
  let enclosed = 0;
  if (doc[at] === "<") {
    const open = ++at;
    while (at < length && !">[]".includes(doc[at]!)) at++;
    if (at >= length) return true;
    if (doc[at] !== ">") return false;
    enclosed = at - open;
    at++;
  }
  // `<>` is no destination: the reader goes on to look for a bare one after it.
  if (enclosed === 0) {
    const bare = at;
    while (at < length && !/[[\]\s]/u.test(doc[at]!)) at++;
    if (at === bare) return at >= length;
  }
  const gap = skip(at, " \t\n");
  if (gap === at || gap >= length) return false;
  const opener = doc[gap];
  const closer =
    opener === '"' || opener === "'" ? opener : opener === "(" ? ")" : "";
  if (closer === "") return false;
  at = gap + 1;
  while (at < length && doc[at] !== closer) {
    if (doc[at] === "\n") {
      at++;
      // A blank line, or a closer straight after a line ending, ends the title for good.
      if (doc[at] === "\n" || doc[at] === closer) return false;
    }
    at++;
  }
  return at >= length;
}

/**
 * Notes a decline the end of the text is to blame for. A quote, a list item or a footnote's body
 * ends itself, so only the top level counts. A footnote definition's check sees 1,024 characters
 * at most, and a window short of the text's end is not cut off by it.
 */
export function watchDefinitionReader(tables: any): void {
  const stock = tables.blockTokenizers.definition;
  tables.blockTokenizers.definition = function (
    this: any,
    eat: unknown,
    value: string,
    silent?: boolean,
  ) {
    const result = stock.call(this, eat, value, silent);
    if (
      !result &&
      !this.definitionCutOff &&
      !this.inList &&
      !this.inBlock &&
      definitionCutOff(value, 0) &&
      // A top-level block's remaining text is the file's tail only because `adapt.ts` normalizes
      // line endings and drops a byte order mark first. A direct caller passing raw `\r\n` text
      // would get a silent `false` here.
      this.file.toString().endsWith(value)
    ) {
      this.definitionCutOff = true;
    }
    return result;
  };
}

/** The answer, from what the watched reader noted and the tree it built. */
export function readsPastEnd(parser: any, tree: Node8): boolean {
  const last = tree.children?.[tree.children.length - 1];
  return (
    parser.definitionCutOff === true ||
    (last?.type === "definition" && last.title == null)
  );
}
