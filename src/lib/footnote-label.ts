import type { Paragraph, PhrasingContent, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

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
 * A footnote label ends at the first `]`, escape or no escape.
 *
 * GFM lets a backslash escape a bracket inside the label, so `[^a\]b]: body` is
 * a definition named `a]b`. Obsidian stops at the first `]` and finds `b`
 * rather than `:` after it, which makes the line ordinary prose. Measured
 * against the legacy stack, `remark-footnotes` agrees with Obsidian.
 *
 * The line is rebuilt as prose rather than re-parsed, because re-parsing it
 * would produce the same definition again. The bare-reference pass then reduces
 * the leading `[^a\]` to `a\`, keeping the backslash, which is what Obsidian
 * renders.
 */
export function footnoteLabelTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const definition = parent.children[index];
      if (definition?.type !== "footnoteDefinition") continue;

      const start = definition.position?.start?.offset;
      const end = definition.position?.end?.offset;
      if (start === undefined || end === undefined) continue;

      const slice = source.slice(start, end);
      if (!slice.startsWith("[^")) continue;
      const close = slice.indexOf("]", 2);
      if (close === -1 || slice[close + 1] === ":") continue;

      const children: PhrasingContent[] = [];
      let offset = start;
      for (const line of slice.split("\n")) {
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
          start: { ...definition.position!.start },
          end: { ...definition.position!.end },
        },
      } as Paragraph);
    }
  });
}
