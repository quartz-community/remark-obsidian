import type { Code, Root, RootContent } from "mdast";

/**
 * Consecutive INDENTED code lines are ONE block, which micromark sometimes splits in two.
 *
 * CommonMark makes a run of indented lines a single code block, and Obsidian reads it that way.
 * Micromark does not always, and the split is UPSTREAM rather than anything here -- bare
 * `remark-parse` + `remark-gfm` reports the identical two nodes on every document measured:
 *
 *     `    ipsum magna [^x]` / `    [^y]: commodo`   obs code@2-3   ours code@2-2 + code@3-3
 *     STOCK remark                                                  code@2-2 + code@3-3
 *
 * Six documents checked that way, all three oracles agreeing that the pair should be one node.
 * So this is an inherited divergence of exactly the kind `legacy-list.ts` and
 * `legacy-code-text.ts` exist for, and not a repair for a defect this package introduces.
 *
 * FENCED blocks are excluded, because two of them in a row are legitimately separate and
 * merging them would concatenate unrelated content. A fence cannot be recognised from the node
 * -- an info-string-less fence and an indented block both carry `lang: null` -- so the opening
 * line is read from the source instead.
 *
 * STRICTLY CONTIGUOUS, which is narrower than CommonMark's own rule: a blank line INSIDE
 * indented code also belongs to the block, so `    x` / `` / `    y` is one node too. That
 * widening is deliberately not taken here, because it is unmeasured -- the contiguous form is
 * worth +14 documents on the `code` dimension with nothing lost, and a blank-line-tolerant
 * version would merge across a gap this package has no evidence about.
 *
 * ROOT LEVEL, matching the dimension that measures it: Obsidian's `code` is a slice of
 * `sections` and therefore root-level by construction, so a nested occurrence of the same split
 * is invisible to the oracle and would be an unmeasured change.
 */
export function adjacentIndentedCodeTransform(
  tree: Root,
  source: string,
): void {
  const lines = source.split("\n");
  const fenced = (node: RootContent): boolean => {
    const at = node.position ? node.position.start.line - 1 : -1;
    return /^[ \t]*(?:```|~~~)/u.test(lines[at] ?? "");
  };

  const out: RootContent[] = [];
  for (const child of tree.children) {
    const last = out[out.length - 1];
    if (
      last !== undefined &&
      last.type === "code" &&
      child.type === "code" &&
      last.position !== undefined &&
      child.position !== undefined &&
      child.position.start.line === last.position.end.line + 1 &&
      !fenced(last) &&
      !fenced(child)
    ) {
      const merged = last as Code;
      merged.value = `${merged.value}\n${child.value}`;
      merged.position = {
        start: last.position.start,
        end: child.position.end,
      };
      continue;
    }
    out.push(child);
  }
  if (out.length !== tree.children.length) tree.children = out;
}
