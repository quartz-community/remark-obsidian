import type { Paragraph, Root, RootContent } from "mdast";

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

  // Forward, not backward: folding one definition extends the paragraph, which
  // is what lets the next definition on the following line fold in turn. Going
  // backwards left the second of `para\n[^2]: a\n[^1]: b` behind.
  let index = 1;
  while (index < children.length) {
    const node = children[index];
    const previous = children[index - 1];
    if (!node || !previous || node.type !== "footnoteDefinition") {
      index++;
      continue;
    }

    // A definition under a list item continues that item's paragraph, so the
    // target is the paragraph at the end of the list rather than a sibling.
    const host =
      previous.type === "paragraph"
        ? previous
        : previous.type === "list"
          ? lastParagraphOf(previous)
          : undefined;
    if (!host) {
      index++;
      continue;
    }

    const startLine = node.position?.start?.line;
    const endLine = previous.position?.end?.line;
    if (
      startLine === undefined ||
      endLine === undefined ||
      startLine - endLine !== 1
    ) {
      index++;
      continue;
    }

    const body = node.children;
    if (body.length !== 1 || body[0]?.type !== "paragraph") {
      index++;
      continue;
    }

    host.children.push(
      { type: "break" },
      { type: "text", value: `[^${node.identifier}]: ` },
      ...(body[0] as Paragraph).children,
    );
    for (const container of [host, previous]) {
      if (container.position && node.position?.end) {
        container.position.end = { ...node.position.end };
      }
    }
    children.splice(index, 1);
  }
}

/** The paragraph a trailing definition would continue, if the list ends in one. */
function lastParagraphOf(list: RootContent): Paragraph | undefined {
  if (list.type !== "list") return undefined;
  const item = list.children[list.children.length - 1];
  if (!item || item.type !== "listItem") return undefined;
  const last = item.children[item.children.length - 1];
  return last && last.type === "paragraph" ? last : undefined;
}
