import type { Root } from "mdast";

const OPENER = /^---[ \t]+(?:\n|$)/u;

/**
 * Frontmatter opens only on an EXACT `---` first line.
 *
 * `micromark-extension-frontmatter` accepts trailing whitespace on the opening
 * fence, so `--- ` opens a YAML block and the body stops being read as Markdown.
 * Obsidian requires the line to be exactly `---` (rule D2), and so does
 * CommonMark by a different route: `--- ` is an ordinary thematic break there,
 * since frontmatter is not a CommonMark construct at all. Both readings agree, so
 * this is not a legacy/strict split and takes no option -- it is the third defect
 * of the same extension corrected in this block.
 *
 * Settled against the live oracle, which also drew the boundary:
 *
 *     `--- `   thematicBreak + a setext H2 whose text carries a LIVE reference
 *     `---`    frontmatter, read as YAML
 *     `---\r`  frontmatter -- a carriage return still opens it
 *
 * So the test is SPACES AND TABS. A `\s`-based one would have taken out the two
 * `hunt/crlf-protection` cases, which are triaged `match` and depend on `---\r`
 * opening frontmatter. `---\t` opens nothing either; Obsidian then reads it as no
 * thematic break, where CommonMark does, and this pass gives CommonMark's reading --
 * it runs under `strict` only, `legacy` parsing with Obsidian's own parser.
 *
 * Of 12 corpus documents whose first line is `---` plus trailing whitespace, 10
 * are space-only, 1 is a tab and 1 is a carriage return.
 *
 * The replacement comes from re-parsing the block behind a blank line. The
 * extension only opens at offset 0, so the prefix is what suppresses it, and one
 * line and one offset are subtracted back off afterwards.
 */
export function frontmatterExactOpenerTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  const yaml = tree.children[0];
  if (yaml?.type !== "yaml") return;
  if (!OPENER.test(source)) return;

  const end = yaml.position?.end.offset;
  if (end === undefined) return;

  const replacement = reparse(`\n${source.slice(0, end)}`).children;
  if (replacement.length === 0) return;

  for (const node of replacement) rewind(node);
  tree.children.splice(0, 1, ...replacement);
}

function rewind(node: unknown): void {
  const candidate = node as {
    position?: { start: Point; end: Point };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.line -= 1;
      if (point.offset !== undefined) point.offset -= 1;
    }
  }
  for (const child of candidate.children ?? []) rewind(child);
}

interface Point {
  line: number;
  column: number;
  offset?: number;
}
