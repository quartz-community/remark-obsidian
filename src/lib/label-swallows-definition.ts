import type { Paragraph, Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface ParentNode extends Node {
  children: RootContent[];
}

/**
 * An unclosed `[` swallows the footnote label that closes it (rule D6).
 *
 * Obsidian's link-reference-definition reader scans from a `[` to the first `]`
 * WITHOUT stopping at a blank line, which CommonMark forbids. So where the first
 * `]` after a stray `[` is the one inside a later `[^1]:` label, that label is
 * consumed as part of the link label and never defines:
 *
 *     `[` / blank / `para` / blank / `[^1]: def`   obs defines NOTHING
 *     `[x` / blank / `[^1]: d`                      obs defines NOTHING
 *     `[a` / blank / `b]: /url` / … / `[^1]: d`     obs DEFINES -- closes at `b]`
 *
 * The third is why the test is the FIRST `]` rather than the presence of one: that
 * label closes on `b]:` before it ever reaches the footnote, so the footnote is
 * untouched. Measured over the corpus the predicate fires on 3 positions and
 * scores 3 gain / 0 break.
 *
 * References are unaffected -- Obsidian still resolves `x[^1]` against nothing and
 * reports it -- so this must run AFTER `bareFootnoteRefTransform`. Running before
 * it, the label left behind is re-read as a bare reference and the document gains
 * a reference Obsidian does not report, which is the revival this package has
 * measured twice before.
 *
 * Gated on `legacyLinkDefinitions`: a link label may not contain a blank line in
 * CommonMark, so `strict` must keep the definition.
 */
export function labelSwallowsDefinitionTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    const children = parent.children;
    if (!Array.isArray(children)) return;

    for (let index = 0; index < children.length; index++) {
      const definition = children[index];
      if (definition?.type !== "footnoteDefinition") continue;

      const at = definition.position?.start.offset;
      if (at === undefined || !swallowed(source, at)) continue;

      const start = definition.position?.start;
      const label = start ? labelOf(source, at, start, definition) : undefined;
      const body = definition.children[0];
      const inline =
        body?.type === "paragraph"
          ? body.children
          : ([] as Paragraph["children"]);

      const replacement: Paragraph = {
        type: "paragraph",
        children: label ? [label, ...inline] : [...inline],
      };
      if (definition.position)
        replacement.position = { ...definition.position };

      children.splice(index, 1, replacement);
    }
  });
}

function swallowed(source: string, at: number): boolean {
  const close = source.indexOf("]", at);
  if (close === -1) return false;

  for (let index = 0; index < at; index++) {
    if (source[index] !== "[") continue;
    if (index > 0 && source[index - 1] === "\\") continue;
    if (source.indexOf("]", index + 1) === close) return true;
  }
  return false;
}

function labelOf(
  source: string,
  at: number,
  start: { line: number; column: number; offset?: number },
  definition: RootContent,
): Text | undefined {
  const body = (definition as { children?: RootContent[] }).children?.[0];
  const inner = (
    body as { children?: Array<{ position?: { start: { offset?: number } } }> }
  )?.children?.[0];
  const to = inner?.position?.start.offset ?? source.indexOf(":", at) + 1;
  if (to <= at) return undefined;

  return {
    type: "text",
    value: source.slice(at, to),
    position: {
      start: { ...start },
      end: {
        line: start.line,
        column: start.column + (to - at),
        offset: to,
      },
    },
  };
}
