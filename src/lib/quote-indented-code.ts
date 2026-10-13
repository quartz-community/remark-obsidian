import type { Code, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { calloutTransform } from "./callout.js";

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
      // ATTEMPTED AND REVERTED, with numbers, because the RULE is confirmed and the repair
      // is not. A tab in the marker's own separator means the content is never code at any
      // number of following spaces -- asked of a running Obsidian directly rather than
      // inferred, and `+⇥   x`, `+⇥    x`, `+⇥     x`, `- ⇥p`, `- ⇥⇥x` and `1.⇥   x` all
      // report a plain `list` with one item and NO `code` section, where four and five
      // spaces would both clear the threshold if the tab were expanded. We make `code` of
      // six of those seven.
      //
      // The test below cannot reach them: the opener pattern's `[ \t]+` swallows the whole
      // separator, so a tab there never appears in `rest`. Re-parsing `rest` when the
      // separator holds a tab fixes `probe/def-tab/marker-tab-spaces` and costs the referee
      // 27 documents -- 78.3% to 77.9% -- and a fence guard recovers none of them.
      //
      // Which oracle to believe was settled by asking Obsidian about the regressed documents
      // rather than reasoning about them. On the first, live 1.14.4 agrees with the referee
      // EXACTLY and our new answer is wrong by one end line; on the second all three differ
      // and ours is wrong either way. So the referee is reliable here and the repair
      // over-reaches on dense documents, however sound the isolated rule is.
      //
      // Three scopings tried, each measured against the referee, and all three are a net
      // loss for the one corpus case they close:
      //
      //     unrestricted                       78.3% -> 77.9%   -27 documents
      //     ...plus a fence guard              78.3% -> 77.9%   -27, recovers none
      //     ...plus root-level items only      78.3% -> 78.0%   -16
      //
      // Narrowing helps and does not reach break-even, so the shape of the repair is wrong
      // rather than its scope. Re-parsing an item's content produces a node with its own
      // extent, and in a dense document that extent competes with every enclosing block --
      // which is the same constraint that made the first version of the pass below throw by
      // splicing a list into a `listItem`.
      //
      // So this belongs in the list construct's own indent accounting, where the tab is
      // measured once and nothing downstream has to be re-parsed. `legacy-list.ts` is the
      // vendored copy that would carry it, and note that its `size` is already in columns --
      // `sliceSerialize(token, true)` expands tabs -- so the change is not the
      // long-cited "characters versus columns" one, which does not exist.
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
      // A callout as well as a plain quote. `compose.mts --matrix` measures `indented` as
      // one of exactly four followers a LIST absorbs and a quote or callout keeps at root --
      // with `setext`, `math` and `html` -- and the quote half was already right here while
      // the callout half absorbed the code. `calloutTransform` runs two passes earlier and
      // has already retyped the node, so a `blockquote`-only test cannot see it: the same
      // "one rule, two node types" shape as the callout-after-list absorption and the two
      // sibling visitors in this file, which both name `callout` explicitly.
      if (quote?.type !== "blockquote" && quote?.type !== "callout") continue;

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

      // `reparse` is `self.parse`, the PARSER rather than the transform chain, so a callout
      // comes back as the plain `blockquote` micromark produces and loses its title node and
      // its `calloutType`. Re-running the real pass is what restores it -- a local
      // reconstruction would be a second, weaker copy of `calloutTransform`, and the shift
      // above has already put the replacement back on the document's own coordinates, which
      // is what that pass needs to read its marker line out of `source`.
      if (quote.type === "callout") {
        calloutTransform(
          { type: "root", children: [replacement] } as Root,
          source,
          reparse,
        );
      }

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
