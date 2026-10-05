import type { Break, Paragraph, Root, RootContent, Text } from "mdast";

import { span } from "./normalize-points.js";

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
 * which turns the re-inserted `[^1]:` back into a reference node; a renderer
 * then bares it to the `1:` Obsidian shows.
 *
 * Every block container is considered, not just the document: a definition under
 * prose inside a quote continues that prose the same way, so
 * `> para` / `> [^q]: quoted` is one paragraph too.
 *
 * Only a single-paragraph body is folded: a definition carrying several blocks
 * has no unambiguous inline form, so it is left alone rather than guessed at.
 */
const CONTAINERS = new Set(["blockquote", "callout", "list", "listItem"]);

export function footnoteInterruptTransform(tree: Root, source = ""): void {
  fold(tree.children, source);
}

function fold(children: RootContent[], source: string): void {
  for (const child of children) {
    if (!CONTAINERS.has(child.type)) continue;
    const inner = (child as unknown as { children?: RootContent[] }).children;
    if (Array.isArray(inner)) fold(inner, source);
  }

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

    // A definition under a list item or a quote continues that block's own
    // trailing paragraph, not a sibling of the block.
    const host =
      previous.type === "paragraph" ? previous : lastParagraphOf(previous);
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
    const single = body.length === 1 && body[0]?.type === "paragraph";
    const from = node.position?.start?.offset;
    const to = node.position?.end?.offset;
    if (!single && (source === "" || from === undefined || to === undefined)) {
      index++;
      continue;
    }

    const breakFrom = previous.position?.end?.offset;
    if (single) {
      // The label as written, not as folded: the identifier mdast carries is
      // lowercased, so rebuilding the text from it renamed `[^Note]` to
      // `[^note]` and left the node unable to reproduce its own span.
      const bodyFrom = (body[0] as Paragraph).position?.start?.offset;
      const written =
        source !== "" && from !== undefined && bodyFrom !== undefined
          ? source.slice(from, bodyFrom)
          : `[^${node.identifier}]: `;
      host.children.push(
        span<Break>({ type: "break" }, source, breakFrom, from),
        span<Text>({ type: "text", value: written }, source, from, bodyFrom),
        ...(body[0] as Paragraph).children,
      );
    } else {
      // A body of several blocks has no inline form to splice, but Obsidian
      // does not need one: the whole thing is prose to it, so the source goes
      // back verbatim and the bare-reference pass reduces the label as usual.
      host.children.push(
        span<Break>({ type: "break" }, source, breakFrom, from),
        span<Text>(
          { type: "text", value: source.slice(from!, to!) },
          source,
          from,
          to,
        ),
      );
    }
    for (const container of [host, previous]) {
      if (container.position && node.position?.end) {
        container.position.end = { ...node.position.end };
      }
    }
    children.splice(index, 1);
  }
}

/** The paragraph a trailing definition would continue, if the block ends in one. */
function lastParagraphOf(node: RootContent): Paragraph | undefined {
  if (node.type === "list") {
    const item = node.children[node.children.length - 1];
    if (!item || item.type !== "listItem") return undefined;
    const last = item.children[item.children.length - 1];
    return last && last.type === "paragraph" ? last : undefined;
  }
  if (node.type !== "blockquote" && node.type !== "callout") return undefined;
  const inner = (node as unknown as { children: RootContent[] }).children;
  const last = inner[inner.length - 1];
  return last && last.type === "paragraph" ? last : undefined;
}
