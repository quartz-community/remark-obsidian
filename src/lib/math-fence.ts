import type { Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

const DOLLAR = "$";

interface MathNode extends Node {
  type: "math";
  value: string;
  meta?: string | null;
}

/**
 * Delimit a display-math block the way Obsidian does.
 *
 * Obsidian parses with `remark-math@3`, whose block tokenizer is not the
 * code-fence template `micromark-extension-math` follows, and the two disagree
 * about what the formula *is* in three ways. Each rule below is that
 * tokenizer's, read from its source rather than inferred:
 *
 * - **The opener's remainder is the body's first line, not an info string.**
 *   `$$x^2` is the formula `x^2`; the fence template puts `x^2` in `meta` and
 *   leaves the body empty.
 * - **A closer need not be alone on its line.** It is a closer when the first
 *   `$` on the line begins its trailing run, so `Math$$` closes the block and
 *   keeps `Math`. A backslash does not escape it: `x^2\$$` closes and the
 *   backslash stays in the formula.
 * - **Only spaces are skipped after the opening fence**, never tabs, so
 *   `$$\t[` is the formula `\t[`.
 *
 * Read from the source rather than repaired from `meta`, because `meta` has
 * already lost the distinction the third rule needs -- micromark skips the tab.
 *
 * Nothing here re-tokenizes. The one case that would need to is a same-line
 * `$$x^2$$`, where the real tokenizer refuses the block outright (a `$` in the
 * opener's remainder voids it) and the inline tokenizer produces display math
 * instead; that stays a tracked divergence rather than a guess.
 */
export function mathFenceTransform(tree: Root, source: string): void {
  if (source === "") return;

  visit(tree, "math", (node: Node) => {
    const math = node as MathNode;
    const from = node.position?.start?.offset;
    const to = node.position?.end?.offset;
    if (from === undefined || to === undefined) return;

    const startLine = node.position?.start?.line;
    if (startLine === undefined) return;

    // Each line without its containers. `remark-parse@8` strips a blockquote
    // marker or a list indent before the tokenizer ever sees the line, so
    // reading the raw slice instead put `> ` inside the formula -- and the
    // serialiser then wrote `> > x^2`, nesting one quote deeper every pass.
    // `data.lineOffsets` is exactly that per-line width.
    const offsets =
      (tree.data as { lineOffsets?: Record<number, number> } | undefined)
        ?.lineOffsets ?? {};
    const raw = source.slice(from, to);
    const sliced = raw.split("\n");
    // A trailing newline inside the span is not an empty final body line: the
    // real tokenizer walks indices and stops, where splitting leaves an empty
    // string that showed up as `$$x^2` -> `"x^2\n"`.
    if (sliced.length > 1 && sliced[sliced.length - 1] === "") sliced.pop();
    // The first line already starts past any container, because the node does;
    // `> tail $$` opens at the `$$`, mid-line and after prose.
    const lines = sliced.map((line, offset) =>
      offset === 0 ? line : line.slice(offsets[startLine + offset] ?? 0),
    );
    const opener = lines[0];
    if (opener === undefined) return;

    // How far the fence is indented inside whatever contains it, taken from the
    // node's column rather than by counting spaces in the slice -- the slice
    // starts *at* the fence, so it shows none. `lineOffsets` covers a quote
    // marker and a list indent but not a footnote definition's continuation,
    // and without this that indent leaked into the formula and grew by four
    // spaces on every formatting pass.
    const indent = Math.max(
      0,
      node.position!.start.column - 1 - (offsets[startLine] ?? 0),
    );

    let index = 0;
    while (opener[index] === DOLLAR) index++;
    const fence = index;
    if (fence < 2) return;
    // Spaces only. A tab after the fence is content, which is the whole reason
    // `meta` cannot be used here.
    while (opener[index] === " ") index++;

    const body: string[] = [];
    if (index < opener.length) body.push(opener.slice(index));

    for (const line of lines.slice(1)) {
      // The scan walks back over trailing spaces and `$`s to judge the line; it
      // is not the content boundary. Reusing it as one truncated a line whose
      // trailing `$$` does *not* close -- `$Math$$` holds an earlier `$`, so it
      // is content, and it lost its own `$$`.
      let scan = line.length;
      while (scan > 0 && line[scan - 1] === " ") scan--;
      let run = 0;
      while (scan > 0 && line[scan - 1] === DOLLAR) {
        run++;
        scan--;
      }
      // A closer when its run is long enough and nothing earlier on the line
      // holds a `$`; `line.indexOf` finding the run's own start is how the
      // tokenizer spells that.
      const closes = run >= fence && line.indexOf(DOLLAR) === scan;

      let end = closes ? scan : line.length;
      let start = 0;
      while (start < end && start < indent && line[start] === " ") start++;
      if (closes) {
        while (end > start && line[end - 1] === " ") end--;
      }
      if (!closes || start !== end) body.push(line.slice(start, end));
      if (closes) break;
    }

    math.value = body.join("\n");
    // `remark-math@3` has no info string, and the opener's remainder is now part
    // of the body. Leaving it behind as well makes the serialiser write
    // `$$x^2\nx^2\n$$`, duplicating the formula on every formatting pass.
    math.meta = null;
  });
}
