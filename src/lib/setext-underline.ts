import type { Paragraph, PhrasingContent, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/** A setext underline exactly as `remark-parse@8` accepts it: nothing around it. */
const STRICT = /^(=+|-+)$/u;
/** What CommonMark accepts: up to three spaces in front, any space behind. */
const LOOSE = /^ {0,3}(=+|-+)[ \t]*$/u;

/**
 * Where a setext heading's content really starts.
 *
 * micromark reports the heading's own start at the beginning of the block that
 * became it, which can sit before a link reference definition it never
 * contained — `[ref]: /url` / `para` / `===` gives a heading starting at
 * offset 0. Slicing from there counts the definition as a content line and
 * rebuilds it into the paragraph. The children know better.
 */
function contentStart(heading: {
  position?: { start: { offset?: number } };
  children?: Array<{ position?: { start: { offset?: number } } }>;
}): number | undefined {
  const first = heading.children?.[0]?.position?.start?.offset;
  return first ?? heading.position?.start?.offset;
}

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

      const start = contentStart(heading);
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
          start: { line: 0, column: 1, offset: start },
          end: { ...heading.position!.end },
        },
      } as Paragraph);
    }
  });
}

/**
 * A multi-line paragraph under an underline is not a heading when a definition
 * follows it.
 *
 * `H` / `===` / `[^1]: real` is a heading and a definition, but
 * `para` / `more` / `===` / `[^2]: b` is one paragraph. The discriminator is
 * the number of content lines, and it was found the hard way: merging on the
 * presence of a following definition alone cost twenty cases that already
 * matched, every one of them single-line.
 *
 * The definition cannot interrupt a paragraph, so with more than one line
 * above it the paragraph runs on and the underline is just text in the middle
 * of it.
 */
export function multilineSetextTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length - 1; index++) {
      const heading = parent.children[index];
      const definition = parent.children[index + 1];
      if (heading?.type !== "heading") continue;
      if (definition?.type !== "footnoteDefinition") continue;

      const start = contentStart(heading);
      const gap = heading.position?.end?.offset;
      const end = definition.position?.end?.offset;
      if (start === undefined || gap === undefined || end === undefined) {
        continue;
      }
      if (source.slice(gap, definition.position!.start!.offset!) !== "\n") {
        continue;
      }

      const lines = source.slice(start, gap).split("\n");
      if (!LOOSE.test(lines[lines.length - 1]!)) continue;
      // One content line keeps the heading; this is the whole rule.
      if (lines.length < 3) continue;

      const children: PhrasingContent[] = [];
      let offset = start;
      for (const line of source.slice(start, end).split("\n")) {
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

      parent.children.splice(index, 2, {
        type: "paragraph",
        children,
        position: {
          start: { line: 0, column: 1, offset: start },
          end: { ...definition.position!.end },
        },
      } as Paragraph);
    }
  });
}
