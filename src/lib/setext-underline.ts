import type { Paragraph, PhrasingContent, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/** A setext underline exactly as `remark-parse@8` accepts it: nothing around it. */
const STRICT = /^(=+|-+)$/u;
/** What CommonMark accepts: up to three spaces in front, any space behind. */
const LOOSE = /^ {0,3}(=+|-+)[ \t]*$/u;

function shiftTo(node: unknown, offset: number): void {
  const candidate = node as {
    position?: {
      start: { line: number; column: number; offset?: number };
      end: { line: number; column: number; offset?: number };
    };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.offset = offset + (point.offset ?? 0);
    }
  }
  for (const child of candidate.children ?? []) shiftTo(child, offset);
}

/**
 * A setext underline has to stand alone to make a heading.
 *
 * CommonMark allows up to three spaces of indent before the run and any
 * whitespace after it. `remark-parse@8` allows neither, so `H` over `  ===` and
 * `para` over `===⇥` are plain paragraphs to Obsidian where we reported
 * headings. Measured against the legacy stack, every variant agrees: a leading
 * space, a trailing space and a trailing tab each cancel the heading.
 *
 * Demoting matters beyond the heading itself. A definition on the next line
 * cannot interrupt a paragraph, so once the heading is prose again the
 * definition folds into it — which is how `H` / `  ===` / `[^1]: real` becomes
 * the single paragraph Obsidian reports.
 */
export function setextUnderlineTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const heading = parent.children[index];
      if (heading?.type !== "heading") continue;

      const start = heading.position?.start?.offset;
      const end = heading.position?.end?.offset;
      if (start === undefined || end === undefined) continue;

      const lines = source.slice(start, end).split("\n");
      const underline = lines[lines.length - 1];
      if (lines.length < 2 || underline === undefined) continue;
      if (!LOOSE.test(underline) || STRICT.test(underline)) continue;

      const children: PhrasingContent[] = [];
      let offset = start;
      for (const line of lines) {
        if (children.length > 0) {
          children.push({ type: "text", value: "\n" } as PhrasingContent);
        }
        const block = reparse(line).children[0];
        if (block?.type === "paragraph") {
          for (const child of block.children) shiftTo(child, offset);
          children.push(...block.children);
        } else {
          children.push({ type: "text", value: line } as PhrasingContent);
        }
        offset += line.length + 1;
      }

      parent.children.splice(index, 1, {
        type: "paragraph",
        children,
        position: {
          start: { ...heading.position!.start },
          end: { ...heading.position!.end },
        },
      } as Paragraph);
    }
  });
}
