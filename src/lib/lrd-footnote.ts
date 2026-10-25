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
const WHITESPACE = /\s/u;

/**
 * A label that MIXES whitespace with content, which the footnote reader declines.
 *
 * A label that is entirely whitespace is excluded: `[^ ]: x` is the blank-label
 * rule, `blank-label-reference.ts` owns it, and the goldens pin it as `match`.
 * Without that exclusion this takes the contract gate down and grows the
 * positioned-oracle divergences 20 -> 22 -- the same boundary the padded-label
 * pass needed, for the same reason.
 */
function holdsWhitespace(label: string): boolean {
  return WHITESPACE.test(label) && label.trim() !== "";
}

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
 *
 * UNLESS THE LABEL HOLDS WHITESPACE, in which case the link reference definition is
 * the RIGHT reading and converting it back invents both a definition and a
 * reference. A footnote label may not contain whitespace, so the footnote extension
 * declined this one on its own rather than losing a fight with frontmatter -- the
 * premise above simply does not hold for it. Obsidian agrees:
 *
 *     `[^ab]: hi`             footnotes=1   a definition
 *     `[^a b]: hi`            footnotes=0   two paragraphs
 *     `[^a⇥b]: hi`            footnotes=0   two paragraphs
 *     `[^a<!-- -->b]: hi`     footnotes=0   two paragraphs
 *
 * The comment case is the one the corpus holds, and it is whitespace by the same
 * test -- the spaces inside `<!-- -->`. Scoped on whitespace rather than on `<!--`
 * because that is the actual rule and it measures better: 2 gain / 0 break against
 * 1 / 0 for the comment-only form.
 */
export function lrdFootnoteTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  const recovered = new Set<string>();

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
      if (holdsWhitespace(label[1] ?? "")) continue;

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

      recovered.add(replacement.identifier);
      parent.children.splice(index, 1, replacement);
    }
  });

  if (recovered.size === 0) return;

  // The mis-parse left more than the definition behind. With `[^1]: d` read as
  // a link reference definition labelled `^1`, every `[^1]` elsewhere resolved
  // against it and became a link reference rendering as `^1`. Those point at a
  // definition that no longer exists, so they are references again too.
  visit(tree, "linkReference", (node: Node, index, parent) => {
    const reference = node as unknown as { identifier: string; label?: string };
    if (!recovered.has(reference.identifier.replace(/^\^/u, ""))) return;
    if (!parent || typeof index !== "number") return;

    const replacement = {
      type: "footnoteReference",
      identifier: reference.identifier.replace(/^\^/u, ""),
      label: reference.label?.replace(/^\^/u, "") ?? reference.identifier,
      position: node.position,
    };
    (parent as unknown as ParentNode).children.splice(
      index,
      1,
      replacement as unknown as RootContent,
    );
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
