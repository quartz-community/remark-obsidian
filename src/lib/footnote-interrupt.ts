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
    const found =
      previous.type === "paragraph"
        ? { paragraph: previous, through: [] as RootContent[] }
        : lastParagraphOf(previous);
    if (!found) {
      index++;
      continue;
    }
    const host = found.paragraph;

    // Adjacency read from OFFSETS, not from line numbers, which is this repo's own standing
    // rule applied to this pass: offsets are what the passes maintain and the rest of a point
    // is rebuilt from them by `normalizePointsTransform`, which runs LAST. Any pass before it
    // that reads `.line` is reading a stale field.
    //
    // It mattered. A pass that splices a node by offset leaves every line at 1, so this read
    // `1 - 1 = 0` and declined -- silently, because the tree is correct either way and only
    // the FOLD is missing. `- item` / `[^1]: def` / `%%` therefore kept a definition inside
    // the item where Obsidian reports none, and a tree dump at this call site is what showed
    // every node reporting `@0-0`.
    //
    // `definition-column.ts` carries the same correction for the same reason, which is why
    // the fallback below is a fallback and not the primary test: `source` defaults to `""`
    // for callers that pass no document, and there the line numbers are all there is.
    const gapFrom = previous.position?.end?.offset;
    const gapTo = node.position?.start?.offset;
    const adjacent =
      source !== "" && gapFrom !== undefined && gapTo !== undefined
        ? // `>` is in the class because a definition INSIDE a quote carries the quote's own
          // prefix in the gap -- `\n> ` -- and excluding it stopped those folding, which cost
          // four corpus cases and opened five `[ footnote ]` composition rows. A blank line
          // is still rejected, since `\n` is not in the class and so cannot repeat.
          /^\n[ \t>]*$/u.test(source.slice(gapFrom, gapTo))
        : (node.position?.start?.line ?? 0) -
            (previous.position?.end?.line ?? 0) ===
          1;
    if (!adjacent) {
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
    // `found.through` is what the search DESCENDED past -- the `listItem` between a list and
    // its trailing paragraph. Stretching only the endpoints left it covering the line before
    // the fold: `> - item` / `[^1]: def` gave `listItem 2->8` holding a `paragraph 4->18`.
    for (const container of [host, previous, ...found.through]) {
      if (container.position && node.position?.end) {
        container.position.end = { ...node.position.end };
      }
    }
    children.splice(index, 1);
  }
}

/**
 * The paragraph a trailing definition would continue, and WHAT WAS DESCENDED PAST to find it.
 *
 * The intermediate nodes are returned because the caller has to stretch them too: a fold
 * extends the paragraph over the definition's line, and every node between that paragraph
 * and the block being folded into has to cover it as well. A list reaches its paragraph
 * through a `listItem`, so that item is the path; a quote or callout holds its paragraph
 * directly and has none.
 *
 * Returning only the endpoint is the same defect twice fixed elsewhere -- `paragraphHostPath`
 * in `lazy-setext.ts` carries the other instance. A transform that locates a node by
 * descending has to treat the descent as the unit of work, because the edit invalidates the
 * span of every node it passed through.
 */
function lastParagraphOf(
  node: RootContent,
): { paragraph: Paragraph; through: RootContent[] } | undefined {
  if (node.type === "list") {
    const item = node.children[node.children.length - 1];
    if (!item || item.type !== "listItem") return undefined;
    const last = item.children[item.children.length - 1];
    return last && last.type === "paragraph"
      ? { paragraph: last, through: [item] }
      : undefined;
  }
  if (node.type !== "blockquote" && node.type !== "callout") return undefined;
  const inner = (node as unknown as { children: RootContent[] }).children;
  const last = inner[inner.length - 1];
  return last && last.type === "paragraph"
    ? { paragraph: last, through: [] }
    : undefined;
}
