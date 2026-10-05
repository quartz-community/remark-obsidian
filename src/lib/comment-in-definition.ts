import type { Break, Paragraph, Root, Text } from "mdast";

import { span } from "./normalize-points.js";

interface CommentNode {
  readonly type: "comment";
  readonly position?: {
    readonly start: { readonly offset?: number };
    readonly end: { readonly offset?: number };
  };
}

/**
 * `comment` is this package's own node and is not in mdast's block-content
 * union, so a definition's children are not typed to admit one even though
 * the tokenizer puts them there.
 */
const isComment = (node: unknown): node is CommentNode =>
  (node as { type?: string } | undefined)?.type === "comment";

/**
 * A `%%` never ends a footnote definition.
 *
 * Obsidian recognises the definition first, so a `%%` inside one cannot open
 * a block comment — `[^1]: a` / `%%` / `b` is a single definition holding
 * three lines of prose. We open a comment there instead, which ends the
 * definition early and leaves the line after it as a paragraph of its own.
 *
 * The comment becomes the text it was written as and the lazily continued
 * lines are folded back in, which is the same repair the interrupt pass makes
 * for a definition that a following block would otherwise cut short.
 */
export function commentInDefinitionTransform(tree: Root, source: string): void {
  if (source === "") return;

  const children = tree.children;
  for (let index = 0; index < children.length; index++) {
    const definition = children[index];
    if (definition?.type !== "footnoteDefinition") continue;

    // Typed `unknown` deliberately: narrowing a value of mdast's block-content
    // union to `comment` intersects to `never`, since the union does not admit
    // this package's own node even though the tokenizer puts one there.
    const last: unknown = definition.children[definition.children.length - 1];
    if (!isComment(last)) continue;

    const host = definition.children.find(
      (child): child is Paragraph => child.type === "paragraph",
    );
    if (!host) continue;

    // The comment is prose again, spelled as the source spelled it.
    const from = last.position?.start?.offset;
    const to = last.position?.end?.offset;
    definition.children.pop();
    // The text covers the comment's own span, so it reproduces the characters
    // it claims; the break covers the newline before it.
    host.children.push(
      span<Break>(
        { type: "break" },
        source,
        from === undefined ? undefined : from - 1,
        from,
      ),
      span<Text>(
        {
          type: "text",
          value:
            from === undefined || to === undefined
              ? "%%"
              : source.slice(from, to),
        } as Text,
        source,
        from,
        to,
      ),
    );

    // Then every block the comment cut loose, while each is still lazy
    // continuation: one newline between, never a blank line.
    while (index + 1 < children.length) {
      const next = children[index + 1];
      const gapFrom = definition.position?.end?.offset;
      const gapTo = next?.position?.start?.offset;
      if (
        next?.type !== "paragraph" ||
        gapFrom === undefined ||
        gapTo === undefined ||
        source.slice(gapFrom, gapTo) !== "\n"
      ) {
        break;
      }
      host.children.push(
        span<Break>({ type: "break" }, source, gapFrom, gapTo),
        ...next.children,
      );
      if (definition.position && next.position) {
        definition.position.end = { ...next.position.end };
      }
      children.splice(index + 1, 1);
    }
  }
}
