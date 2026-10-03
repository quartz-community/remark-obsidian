import type { Paragraph, Root } from "mdast";

/**
 * A footnote definition may not interrupt a paragraph.
 *
 * `micromark-extension-gfm-footnote` lets one start on the line straight after
 * paragraph text, so `a[^1]\n[^1]: mid` parses as a paragraph plus a definition.
 * Obsidian reads that second line as lazy continuation and reports one paragraph,
 * which is also how CommonMark treats a link reference definition in the same
 * position. A blank line still separates them, and then it really is a definition.
 *
 * The label is re-inserted as literal text and the body's own inline nodes are
 * spliced in after it, so a construct inside the body survives rather than being
 * flattened back to source. This has to run before `bareFootnoteRefTransform`,
 * which is what turns the re-inserted `[^1]:` into the `1:` Obsidian shows.
 *
 * Only top-level children are considered, and only a single-paragraph body is
 * folded: a definition carrying several blocks has no unambiguous inline form, so
 * it is left alone rather than guessed at.
 */
export function footnoteInterruptTransform(tree: Root): void {
  const children = tree.children;

  for (let index = children.length - 1; index > 0; index--) {
    const node = children[index];
    const previous = children[index - 1];
    if (!node || !previous) continue;
    if (node.type !== "footnoteDefinition" || previous.type !== "paragraph") {
      continue;
    }

    const startLine = node.position?.start?.line;
    const endLine = previous.position?.end?.line;
    if (startLine === undefined || endLine === undefined) continue;
    if (startLine - endLine !== 1) continue;

    const body = node.children;
    if (body.length !== 1 || body[0]?.type !== "paragraph") continue;

    const paragraph = previous as Paragraph;
    paragraph.children.push(
      { type: "break" },
      { type: "text", value: `[^${node.identifier}]: ` },
      ...(body[0] as Paragraph).children,
    );
    if (paragraph.position && node.position?.end) {
      paragraph.position.end = { ...node.position.end };
    }
    children.splice(index, 1);
  }
}
