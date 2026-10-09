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

/** A footnote definition's continuation indent: four spaces, or the tab it stands for. */
const CONTINUATION_INDENT = /^(?: {1,4}|\t)/u;

/** The ASCII punctuation a backslash may escape, per CommonMark. */
const PUNCTUATION = new Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~");

/**
 * A line of the comment's source as a text node's value, with escapes resolved.
 *
 * The raw slice is the right source for the *span* and the wrong one for the *value*.
 * Left raw, `\[\[target]]` stays spelled with its backslashes, `remark-stringify`
 * escapes them again on the way out, and the run doubles on every pass. Resolving
 * them is what a text node for this span would have held anyway, so re-escaping is
 * idempotent and the formatter settles.
 *
 * Only the backslash is dropped, never a character, so the value stays aligned with
 * the span for everything after it -- which is what the `[^2]` inside
 * `hunt/obsidian-comments/23` needs.
 */
function resolveEscapes(line: string): string {
  if (!line.includes("\\")) return line;

  let out = "";
  let at = 0;
  while (at < line.length) {
    const next = line[at + 1];
    if (line[at] === "\\" && next !== undefined && PUNCTUATION.has(next)) {
      out += next;
      at += 2;
      continue;
    }
    out += line[at];
    at += 1;
  }
  return out;
}

/**
 * The comment's source as one text node per line, indent excluded, spans exact.
 *
 * A container's indent is structure, not content, and folding the raw slice in as
 * a single node keeps it. The `footnoteDefinition` handler then indents that value
 * a second time on the way out, so `    b` is written at eight columns; the leading
 * space of the doubled run is encoded as `&#x20;` to preserve it, and the `&` of
 * *that* is escaped on the pass after. Each round adds four columns and a backslash
 * run, without bound -- a 48-byte definition reaches 12kB in eleven passes.
 *
 * Stripping the indent out of one whole-span node fixes the growth and costs worse:
 * `hunt/obsidian-comments/23` carries a `[^2]` inside the comment, and removing four
 * characters from a value whose position still spans them shifts every offset derived
 * from it. That showed up as `footnoteRefs` 3 -> 4 and three unplaced counters, and a
 * wrong offset is worse than a missing one.
 *
 * So the split is per line, each segment spanning exactly the characters it holds,
 * with a `break` over each line ending -- the same reason `legacy-scan.ts` gives every
 * line ending its own token and `blank-label-reference.ts` splits before
 * `remark-breaks` can. `commentQuoteExtentTransform` strips `>` from its continuation
 * lines for the same underlying reason; it needs no spans because it rebuilds a value
 * the tokenizer owns.
 */
function pushCommentLines(
  host: Paragraph,
  source: string,
  from: number,
  to: number,
): void {
  const lines = source.slice(from, to).split("\n");
  let cursor = from;

  for (let offset = 0; offset < lines.length; offset++) {
    const line = lines[offset] ?? "";
    if (offset > 0) {
      host.children.push(
        span<Break>({ type: "break" }, source, cursor - 1, cursor),
      );
    }
    const indent =
      offset === 0 ? 0 : (CONTINUATION_INDENT.exec(line)?.[0].length ?? 0);
    const contentTo = cursor + line.length;
    host.children.push(
      span<Text>(
        { type: "text", value: resolveEscapes(line.slice(indent)) } as Text,
        source,
        cursor + indent,
        contentTo,
      ),
    );
    cursor = contentTo + 1;
  }
}

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
    );
    if (from === undefined || to === undefined) {
      host.children.push({ type: "text", value: "%%" } as Text);
    } else {
      pushCommentLines(host, source, from, to);
    }

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
