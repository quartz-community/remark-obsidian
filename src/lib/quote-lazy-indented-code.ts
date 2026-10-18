import type { Code, Root, RootContent } from "mdast";
import type { Node } from "unist";

const QUOTED = /^[ \t]*>/u;
const INDENTED = /^(?: {4}|\t)/u;
const QUOTES = new Set(["blockquote", "callout"]);

/**
 * A LAZY line indented four columns under a ROOT quote is root indented code.
 *
 * Found by `compose.mts --lazy`, the axis built for partially-prefixed container bodies --
 * the shape no other axis can generate, since `--inside` prefixes every line of its inner
 * block. 16 of its 512 cells diverged and all 16 were this.
 *
 * THE PREDICATE IS `/^(?: {4}|\t)/`, measured rather than assumed. Eighteen follower indents
 * asked of the live app under an open quote:
 *
 *     0-3sp    not code        4sp..8sp      CODE        tabtab  CODE
 *     tab      CODE            tab+1..4sp    CODE
 *     1sp+tab / 2sp+tab / 3sp+tab            NOT code
 *
 * Four spaces OR a leading tab reproduces all eighteen. The space-then-tab rows are the
 * asymmetry `definition-indented-code.ts` carries the same pattern for -- a tab AFTER a space
 * reaches nothing at an indent threshold -- so the predicate is derived twice, independently,
 * from two oracles.
 *
 * ROOT QUOTES ONLY, which is a restriction from the construct and not a fit to the losses:
 *
 *     quote at column 0              indent 0..12   ....CCCCCCCCC
 *     quote at column 2, in an item                 .............
 *     quote at column 4, in a definition            .............
 *
 * A nested quote produces NO root code at any indent, because its lazy line belongs to the
 * container above it and there is no root block for the line to become. Adding that
 * restriction moved the score from 35/7 to 34/5 and raised BOTH counters, which is the shape
 * a correct restriction has -- one gain traded for two losses removed.
 *
 * AND THE QUOTE'S LAST CHILD IS IRRELEVANT, which is worth stating because the remaining
 * losses suggested otherwise. A definition, a link definition, a fence and a comment all
 * produce code on the indented lazy line, eight shapes for eight:
 *
 *     "> [^2]: def" / "⟨5sp⟩continued"      code@1-1, and the definition does NOT continue
 *     "> ```"       / "⟨5sp⟩continued"      code@1-1
 *
 * So there is no definition-continuation exception to carve out, and the five documents this
 * still loses are not that family.
 *
 * `score.mts` scored it `better 34 / worse 5 / same 5` for +9 agreeing documents and referee
 * +2 before any of this was built.
 */
export function quoteLazyIndentedCodeTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;

  const lines = source.split("\n");
  const starts: number[] = [];
  let at = 0;
  for (const line of lines) {
    starts.push(at);
    at += line.length + 1;
  }

  const lazyRun = (from: number, to: number): [number, number] | undefined => {
    let first = -1;
    for (let line = from + 1; line <= to; line++) {
      const text = lines[line] ?? "";
      if (text.trim() === "") continue;
      if (QUOTED.test(text)) continue;
      if (!INDENTED.test(text)) continue;
      first = line;
      break;
    }
    if (first < 0) return undefined;
    let last = first;
    while (last + 1 <= to) {
      const text = lines[last + 1] ?? "";
      if (text.trim() === "" || QUOTED.test(text) || !INDENTED.test(text))
        break;
      last += 1;
    }
    return [first, last];
  };

  // Walked to ANY DEPTH with the parent in hand, because lazy continuation can bury a
  // column-0 quote inside another container -- the root-only scan is what left the first
  // version of `quoted-fence-lazy.ts` completely inert.
  const walk = (parent: { children?: RootContent[] }): void => {
    const children = parent.children;
    if (!Array.isArray(children)) return;
    for (let index = children.length - 1; index >= 0; index--) {
      const node = children[index];
      if (!node) continue;
      walk(node as unknown as { children?: RootContent[] });
      if (!QUOTES.has(node.type)) continue;
      const position = node.position;
      if (!position || position.start.column !== 1) continue;

      const run = lazyRun(position.start.line - 1, position.end.line - 1);
      if (!run) continue;
      const [first, last] = run;

      const code: Code = {
        type: "code",
        lang: null,
        meta: null,
        value: lines
          .slice(first, last + 1)
          .map((line) => line.replace(INDENTED, ""))
          .join("\n"),
        position: {
          start: { line: first + 1, column: 1, offset: starts[first]! },
          end: {
            line: last + 1,
            column: (lines[last]?.length ?? 0) + 1,
            offset: starts[last]! + (lines[last]?.length ?? 0),
          },
        },
      };

      // Everything the quote swallowed from the cut onward goes with it: the lines became
      // code, so a definition or reference standing on one of them is not indexed either.
      //
      // CLAMPED, not merely shrunk onto the last child. A child that STARTS before the cut
      // and ENDS after it -- the lazily-continued paragraph, which is the whole defect --
      // survives the drop and keeps its end past the cut, so pulling the quote back onto it
      // leaves the quote still covering the code node. That is 15 `SIBLINGS OVERLAP`
      // violations in `compose.test.ts`, which is the gate catching exactly what it is for.
      clamp(node, first, {
        line: first,
        column: (lines[first - 1]?.length ?? 0) + 1,
        offset: (starts[first - 1] ?? 0) + (lines[first - 1]?.length ?? 0),
      });
      children.splice(index + 1, 0, code as RootContent);
    }
  };
  walk(tree as unknown as { children?: RootContent[] });
}

interface Point {
  line: number;
  column: number;
  offset: number;
}

/**
 * Cut a subtree back so nothing in it reaches past `maxLine`, a ONE-BASED line number.
 *
 * A descendant starting past the line goes; one spanning it is trimmed, value included --
 * the lazily-continued paragraph still holds the code line's text, and leaving that behind
 * while moving its position is the mismatch these notes record as the wrong source for a
 * value. The line count is what gets dropped, not a re-slice of the source, because the
 * value is what the tokenizer resolved and a slice is what the author typed.
 */
function clamp(node: Node, maxLine: number, fallback: Point): void {
  const self = node as unknown as { children?: RootContent[]; value?: unknown };
  const children = self.children;

  if (Array.isArray(children)) {
    for (let index = children.length - 1; index >= 0; index--) {
      const child = children[index]!;
      const start = child.position?.start?.line;
      if (start !== undefined && start > maxLine) {
        children.splice(index, 1);
        continue;
      }
      clamp(child, maxLine, fallback);
    }
    const last = children[children.length - 1];
    if (node.position && last?.position?.end) {
      node.position.end = { ...last.position.end };
      return;
    }
  }

  const end = node.position?.end;
  if (!end || end.line <= maxLine) return;
  if (typeof self.value === "string") {
    const keep = self.value.split("\n").length - (end.line - maxLine);
    self.value = self.value.split("\n").slice(0, Math.max(1, keep)).join("\n");
  }
  node.position!.end = { ...fallback };
}
