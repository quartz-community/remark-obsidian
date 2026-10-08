import type { Root, RootContent, Paragraph } from "mdast";

/** A bracket pair holding whitespace and nothing else. */
const BLANK_LABEL = /^\[[ \t\n]+\]$/u;

function placed(
  value: string,
  from: number,
  to: number,
  host: Paragraph,
): RootContent {
  return {
    type: "text",
    value,
    position: {
      start: { ...host.position!.start, offset: from },
      end: { ...host.position!.end, offset: to },
    },
  } as unknown as RootContent;
}

/**
 * A link label of only whitespace still resolves against its definition.
 *
 * CommonMark requires a label to hold one non-whitespace character, so micromark reads
 * `[ ]` as plain text. `remark-parse@8` makes a `linkReference` of it unconditionally,
 * and Obsidian renders `[⏎ ]` over `[⏎ ]: /uri` as a real anchor with nothing in it --
 * the same empty-anchor shape as a label that is only a footnote marker.
 *
 * Gated on a definition with that exact identifier existing, which is what keeps every
 * task checkbox out of it: `- [ ] todo` holds the same bracket pair and defines
 * nothing. 66 recorded cases carry a whitespace-only pair and 65 are checkboxes, so the
 * gate is doing all the work here and the measurement is the only reason to trust it.
 *
 * Only a paragraph that is *entirely* the label, so the span is the paragraph's own and
 * no offset has to be invented. A label buried in a longer paragraph is left alone:
 * promoting one wherever the tree has no link for it was measured at eight gains
 * against thirty-five regressions, and this narrower rule has no mandate to widen that.
 *
 * Needs `linkReferenceToMarkdown` to be registered, or the formatter writes the label
 * twice. That was measured, and it is why this pass was reverted once before.
 */
export function blankLabelReferenceTransform(tree: Root, source: string): void {
  const defined = new Set<string>();
  for (const child of tree.children) {
    if (child.type !== "definition") continue;
    if (/^[ \t\n]+$/u.test(child.identifier)) defined.add(child.identifier);
  }
  if (defined.size === 0) return;

  for (const child of tree.children) {
    if (child.type !== "paragraph") continue;
    const from = child.position?.start?.offset;
    const to = child.position?.end?.offset;
    if (from === undefined || to === undefined) continue;

    const slice = source.slice(from, to);
    if (!BLANK_LABEL.test(slice)) continue;
    const name = slice.slice(1, -1);
    if (!defined.has(name)) continue;

    // Split on line endings here rather than handing over one text node holding a
    // `\n`. `remark-breaks` runs after this plugin and would split it itself, into
    // nodes with no positions at all -- which the unplaced-node gate catches, and
    // rightly: a label spanning a line ending is exactly the shape this case is.
    const inner: RootContent[] = [];
    let cursor = from + 1;
    for (const piece of name.split("\n")) {
      if (piece !== "") {
        inner.push(placed(piece, cursor, cursor + piece.length, child));
      }
      cursor += piece.length;
      if (cursor < to - 1) {
        inner.push({
          type: "break",
          position: {
            start: { ...child.position!.start, offset: cursor },
            end: { ...child.position!.start, offset: cursor + 1 },
          },
        } as unknown as RootContent);
        cursor += 1;
      }
    }

    (child as Paragraph).children = [
      {
        type: "linkReference",
        identifier: name,
        label: name,
        referenceType: "shortcut",
        children: inner,
        position: {
          start: { ...child.position!.start },
          end: { ...child.position!.end },
        },
      } as unknown as RootContent,
    ] as Paragraph["children"];
  }
}
