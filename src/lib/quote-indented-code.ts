import type { Code, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface ParentNode extends Node {
  children: RootContent[];
}

interface Point {
  line: number;
  column: number;
  offset?: number;
}

const QUOTED = /^[ \t]*>/;
const CODE_INDENT = 4;

/**
 * The indent a line needs before it counts as code here.
 *
 * Measured from the container's own content column, not from column zero. A
 * footnote definition continues at four spaces, so inside one those four are the
 * continuation and code needs eight -- `[^1]: > [!note` over `    [[target]]` is
 * the quote's lazy continuation, and cutting it into code lost the wikilink
 * Obsidian indexes. At root there is no prefix and the threshold is unchanged.
 *
 * Asked of the **ancestry** and not of the quote's immediate parent, which is what
 * `fuzz/embed/56` forces: `[^1]: > > <ma` over `    target]]. [![[#tag]]](u)` nests a
 * quote inside a quote, so the inner one's parent is a `blockquote` and the four-space
 * threshold came back even though the definition's own continuation is what those four
 * spaces are. The outer quote was already right, which is why the bug needed two levels
 * to show.
 */
function codeIndent(inDefinition: boolean): number {
  return inDefinition ? CODE_INDENT * 2 : CODE_INDENT;
}

/**
 * An indented line below a quote is code, not lazy continuation.
 *
 * CommonMark cannot start indented code inside a paragraph, so `> quote` /
 * `> more` / `    code` reads the third line as more of the quoted paragraph.
 * Obsidian ends the quote there and opens a code block, which changes what the
 * text means — code is literal, so a `[^1]` in it stays written.
 */
export function quoteIndentedCodeTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  /** Every node under a footnote definition, whose four spaces are continuation. */
  const inDefinition = new Set<Node>();
  visit(tree, "footnoteDefinition", (node: Node) => {
    visit(node, (inner: Node) => {
      inDefinition.add(inner);
    });
  });

  // Indented code INSIDE a quote, which is a different shape from the one below: there
  // the indented lines follow the quote and carry no `>`, here every line has the marker
  // and the indent sits past it. `> [!info]` / `>     dolor [^b]` / `>     [^b]: velit`
  // indexes NOTHING in Obsidian -- no reference, no definition -- because the content is
  // four columns past the quote's own content column and so is code.
  //
  // Measured over the referee corpus: of quoted lines holding a `[^`, those indented
  // exactly 4 columns past the prefix are 84% hidden (223 of 264) against a 37% baseline
  // at indent 0, while indent 3 is 20% -- below baseline. The threshold is the same
  // `codeIndent` the pass below uses, doubled inside a definition.
  //
  // Only a paragraph whose EVERY line clears the threshold is converted. A mixed
  // paragraph -- `> q` over `>     code` -- is lazy continuation to CommonMark and has
  // its own evidence to gather, so it is left alone rather than guessed at.
  visit(tree, (node: Node) => {
    const holder = node as Partial<ParentNode>;
    if (!Array.isArray(holder.children)) return;
    if (holder.type !== "blockquote" && holder.type !== "callout") return;

    for (let index = 0; index < holder.children.length; index++) {
      const block = holder.children[index];
      if (block?.type !== "paragraph") continue;
      const from = block.position?.start?.offset;
      const to = block.position?.end?.offset;
      const first = block.position?.start?.line;
      if (from === undefined || to === undefined || first === undefined)
        continue;

      const want = codeIndent(inDefinition.has(block));
      const lineStart = source.lastIndexOf("\n", from - 1) + 1;
      const rows = source.slice(lineStart, to).split("\n");
      if (rows.length < 1) continue;
      let every = true;
      for (const row of rows) {
        if (quotedIndent(row) < want) {
          every = false;
          break;
        }
      }
      if (!every) continue;

      const code: Code = {
        type: "code",
        lang: null,
        meta: null,
        value: rows.map((row) => row.slice(prefixLength(row))).join("\n"),
        position: { ...block.position! },
      };
      holder.children.splice(index, 1, code);
    }
  });

  // An indented `code` block a container produced from a TAB AFTER A SPACE is not code to
  // Obsidian. micromark follows CommonMark and advances a tab to the next tab stop, so
  // `>   ⇥[^1]: def` measures six columns past the quote's content column and becomes code;
  // Obsidian counts a tab after a space as ONE column, measures three, and reports a
  // definition. Six `probe/def-tab/*` cases establish the asymmetry -- a LEADING tab does
  // reach the threshold, so `⇥[^1]: def` really is code -- and the referee holds 127
  // definitions on tab-prefixed lines this loses.
  //
  // The CONTAINER'S OWN PREFIX has to come off before the indent is measured or re-parsed,
  // and getting that wrong is what made a first attempt throw: reusing the quote-only
  // `prefixLength` left a list line whole, so `+⇥   [^1]: def` re-parsed as a new LIST and
  // splicing a list into a `listItem` broke the next pass.
  visit(tree, (node: Node) => {
    const holder = node as Partial<ParentNode>;
    if (!Array.isArray(holder.children)) return;
    const kind = holder.type;
    if (kind !== "blockquote" && kind !== "callout" && kind !== "listItem") {
      return;
    }
    for (let index = 0; index < holder.children.length; index++) {
      const block = holder.children[index];
      if (block?.type !== "code" || block.lang !== null) continue;
      const from = block.position?.start?.offset;
      const to = block.position?.end?.offset;
      const line = block.position?.start?.line;
      if (from === undefined || to === undefined || line === undefined)
        continue;

      const bol = source.lastIndexOf("\n", from - 1) + 1;
      const whole = source.slice(bol, to);
      // One line only, so the splice stays a single node.
      if (whole.includes("\n")) continue;

      // The container's prefix: a `>` run for a quote, the marker and its separator for an
      // item on its own first line. An item whose code starts on a later line carries only
      // indentation and is left alone, since its width is the measured content column
      // rather than anything on this line.
      const opener =
        kind === "listItem"
          ? /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/u.exec(whole)
          : /^(?:[ \t]*>[ \t]?)+/u.exec(whole);
      if (!opener) continue;
      const rest = whole.slice(opener[0].length);
      if (!rest.includes("\t")) continue;

      let columns = 0;
      let seenSpace = false;
      let eaten = 0;
      for (const character of rest) {
        if (character === " ") {
          columns += 1;
          seenSpace = true;
          eaten += 1;
          continue;
        }
        if (character === "\t") {
          columns += seenSpace ? 1 : 4 - (columns % 4);
          eaten += 1;
          continue;
        }
        break;
      }
      if (columns >= CODE_INDENT) continue;

      const content = rest.slice(eaten);
      const parsed = reparse(content);
      if (parsed.children.length !== 1) continue;
      const replacement = parsed.children[0]!;
      shift(replacement, bol + opener[0].length + eaten, line - 1);
      holder.children.splice(index, 1, replacement);
    }
  });

  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const quote = parent.children[index];
      if (quote?.type !== "blockquote") continue;

      const start = quote.position?.start?.offset;
      const end = quote.position?.end?.offset;
      const line = quote.position?.start?.line;
      if (start === undefined || end === undefined || line === undefined) {
        continue;
      }

      const want = codeIndent(inDefinition.has(quote));
      const indented = (text: string): boolean =>
        text.length > want &&
        text.slice(0, want).trim() === "" &&
        text.charAt(want) !== " " &&
        text.slice(want).trim() !== "";

      const lines = source.slice(start, end).split("\n");
      let cut = lines.length;
      while (cut > 0) {
        const candidate = lines[cut - 1]!;
        if (QUOTED.test(candidate) || !indented(candidate)) break;
        cut--;
      }
      if (cut === lines.length || cut === 0) continue;

      const kept = lines.slice(0, cut).join("\n");
      const parsed = reparse(kept);
      if (parsed.children.length !== 1) continue;

      const replacement = parsed.children[0]!;
      for (const child of [replacement]) shift(child, start, line - 1);

      const tail = lines.slice(cut);
      const block: Code = {
        type: "code",
        lang: null,
        meta: null,
        value: tail.map((text) => text.slice(want)).join("\n"),
        position: {
          start: {
            line: line + cut,
            column: 1,
            offset: start + kept.length + 1,
          },
          end: { line: line + lines.length - 1, column: 1, offset: end },
        },
      };

      parent.children.splice(index, 1, replacement, block);
      index++;
    }
  });
}

function shift(node: unknown, offset: number, line: number): void {
  const candidate = node as {
    position?: { start: Point; end: Point };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.offset = offset + (point.offset ?? 0);
      point.line += line;
    }
  }
  for (const child of candidate.children ?? []) shift(child, offset, line);
}

/** How many characters of a line the quote markers and their own spacing take. */
function prefixLength(line: string): number {
  let index = 0;
  let sawQuote = false;
  while (index < line.length) {
    if (line[index] === " " || line[index] === "\t") {
      index += 1;
      continue;
    }
    if (line[index] !== ">") break;
    sawQuote = true;
    index += 1;
    // One space belongs to the marker, which is CommonMark's rule and the difference
    // between `>     code` and `>    not code` in its own example 252.
    if (line[index] === " " || line[index] === "\t") index += 1;
  }
  return sawQuote ? index : 0;
}

/**
 * A quoted line's indent in COLUMNS past the quote's own content column.
 *
 * Tabs are expanded, which is what separates the two shapes Obsidian treats differently:
 * `>` then five spaces is five columns and reads as code, while `>` then a tab advances
 * to column 4 for an indent of three and stays a paragraph -- the referee has the
 * reference indexed in the second and absent in the first.
 */
function quotedIndent(line: string): number {
  let column = 0;
  let index = 0;
  let sawQuote = false;
  while (index < line.length) {
    const character = line[index]!;
    if (character === ">") {
      sawQuote = true;
      column += 1;
      index += 1;
      // One space or tab belongs to the MARKER, not to the content's indent. That is
      // CommonMark's own rule and it is what separates the two halves of its example
      // 252: `>     code` is four columns past the prefix and is code, `>    not code` is
      // three and is a paragraph. Counting the marker's own space as indent converted
      // both and broke that case.
      const after = line[index];
      if (after === " ") {
        column += 1;
        index += 1;
      } else if (after === "\t") {
        column += 4 - (column % 4);
        index += 1;
      }
      continue;
    }
    break;
  }
  if (!sawQuote) return -1;
  const base = column;
  while (index < line.length) {
    const character = line[index]!;
    if (character === " ") {
      column += 1;
      index += 1;
      continue;
    }
    if (character === "\t") {
      column += 4 - (column % 4);
      index += 1;
      continue;
    }
    break;
  }
  return index >= line.length ? -1 : column - base;
}
