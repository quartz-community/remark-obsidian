import type { Code, Root } from "mdast";
import { setMathValue } from "./math-value.js";
import { visit } from "unist-util-visit";

/** The indent a footnote definition's continuation lines carry. */
const DEFINITION_INDENT = 4;

/** `line` without up to `columns` columns of leading whitespace, a tab reaching the next stop. */
function dedent(line: string, columns: number): string {
  let column = 0;
  let index = 0;
  while (index < line.length && column < columns) {
    const character = line[index];
    if (character === " ") column += 1;
    else if (character === "\t") column += 4 - (column % 4);
    else break;
    if (column > columns) break;
    index += 1;
  }
  return line.slice(index);
}

/**
 * Repairs the whitespace-only lines of code and display math inside a footnote definition
 * (`strict` only). Math was the same defect, found by the million-seed census: 91 seeds that
 * never settled, `[^1]: - $$` / `····`.
 *
 * `micromark-extension-gfm-footnote` does not consume a definition's indent on a whitespace-only
 * line, so that line's `value` keeps the container's four columns: `[^1]:` / `····~~~~` / `····`
 * holds `····` where remark-parse 8 holds nothing. The writer indents the value again, so
 * formatting grew four spaces on every pass and never settled (UPSTREAM.md item 9, found by
 * `fuzz/invariant-sweep.ts`). Every other line is consumed correctly, and so is every other
 * container's indent, so exactly the definition's four columns come off those lines.
 */
export function footnoteCodeBlankLinesTransform(tree: Root): void {
  visit(tree, "footnoteDefinition", (definition) => {
    visit(definition, (node) => {
      if (node.type !== "code" && node.type !== "math") return;
      const block = node as Code | (Omit<Code, "type"> & { type: "math" });
      if (!/\n|^[ \t]+$/u.test(block.value)) return;
      const value = block.value
        .split("\n")
        .map((line) =>
          /^[ \t]+$/u.test(line) ? dedent(line, DEFINITION_INDENT) : line,
        )
        .join("\n");
      if (value === block.value) return;
      // A formula renders from its hint, not its `value`, so both are written together.
      if (block.type === "math") setMathValue(block, value);
      else block.value = value;
    });
  });
}
