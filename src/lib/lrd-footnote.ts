import type { FootnoteDefinition, Root, RootContent } from "mdast";
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

const LABEL = /^[ \t]*\[\^([^\]]*)\]:[ \t]*/;

/**
 * `[^1]: x` is a footnote definition even when a `---` block precedes it.
 *
 * Registering `micromark-extension-frontmatter` alongside
 * `micromark-extension-gfm-footnote` changes which construct wins, and the
 * footnote definition starts losing to the link reference definition: on its own
 * `[^Note]: alpha` is a `footnoteDefinition`, but after any `---` it becomes a
 * `definition` with `identifier: "^note"`. It reproduces with official
 * `remark-frontmatter` in either registration order, so it is an upstream
 * interaction rather than something this package introduced.
 *
 * Converting back is safe rather than a guess: with GFM footnotes enabled a label
 * opening with `^` is always a footnote definition, never a link reference. The
 * body is rebuilt from source because the mis-parse scattered it across the
 * definition's `url` and `title`.
 */
export function lrdFootnoteTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const definition = parent.children[index];
      if (definition?.type !== "definition") continue;
      if (!definition.identifier.startsWith("^")) continue;

      const start = definition.position?.start?.offset;
      const end = definition.position?.end?.offset;
      if (start === undefined || end === undefined) continue;

      const slice = source.slice(start, end);
      const label = LABEL.exec(slice);
      if (!label) continue;

      const parsed = reparse(slice.slice(label[0].length));
      if (parsed.children.length === 0) continue;

      const base = start + label[0].length;
      const line = (definition.position?.start?.line ?? 1) - 1;
      for (const child of parsed.children) shift(child, base, line);

      const replacement: FootnoteDefinition = {
        type: "footnoteDefinition",
        identifier: label[1]!.toLowerCase(),
        label: label[1]!,
        children: parsed.children as FootnoteDefinition["children"],
      };
      if (definition.position) replacement.position = definition.position;

      parent.children.splice(index, 1, replacement);
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
