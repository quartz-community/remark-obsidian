import type { FootnoteDefinition, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { mapLines, shiftByMap } from "./line-map.js";

const MARKER = "%%";
/** A line holding nothing, allowing a container's own prefix on it. */
const BLANK = /^[ \t]*(?:>[ \t]*)*$/u;

interface CommentNode extends Node {
  type: "comment";
  value: string;
  children?: RootContent[];
}

/**
 * `comment` is this package's own node and is not in mdast's block-content
 * union, so narrowing a definition's child to it intersects to `never` even
 * though the tokenizer puts one there.
 */
const isComment = (node: unknown): node is CommentNode =>
  (node as { type?: string } | undefined)?.type === "comment";

/**
 * A blank line ends a definition, even with an unclosed `%%` inside it.
 *
 * The comment is bounded by the definition and the definition by its blank line,
 * so an opener with no closer reaches the end of the definition and no further.
 * Recorded against Obsidian 1.14.4:
 *
 *     [^1]: one          the definition ends on the `%%` line, and
 *     %%                 `use[^1]` below the blank is a live reference
 *
 *     use[^1]
 *
 *     [^1]: one          no blank, so `b` continues the definition lazily
 *     %%                 and the `%%` does not end it -- which is why
 *     b                  `commentInDefinitionTransform` exists
 *
 * Scoped to a definition deliberately. The same rule stated globally is wrong:
 * at the top level an unclosed `%%` runs to the end of the note, blank lines and
 * all, which a committed golden pins. Only a container that is itself
 * blank-line-terminated bounds the comment this way.
 *
 * A BLANK LINE IS NOT THE ONLY THING THAT ENDS THE HOST, and the other one is not handled
 * here. A following DEFINITION LABEL ends a definition too, so it ends the comment inside it.
 * Five probes, and only the last diverges:
 *
 *     %%         / [^1]: one / %%                 buries `1`   -- we agree
 *     > %%       / > [^1]: one / > %%             buries `1`   -- we agree
 *     > %%       / > [^1]: one                    buries `1`   -- we agree
 *     > %%       / [^1]: one / > %%               buries `1`   -- we agree
 *     > [^9]: orphan / > %% / > [^1]: one / > %%  defines BOTH  -- we define only `9`
 *
 * The last one is the rule: `> [^9]: orphan` makes the `%%` a CONTINUATION of that definition
 * rather than a fresh opener, so the comment is bounded by `[^9]` -- and `> [^1]: one` starts a
 * new definition, which ends `[^9]` and therefore ends the comment. The definition below it is
 * live. Without the `[^9]` line the `%%` is a plain opener and does bury what follows.
 *
 * Found by classifying the 75 referee documents where Obsidian DEFINES a label and we emit a
 * REFERENCE at the same place. The largest bucket is 25 "inside an unclosed `%%`", and within
 * it 15 are regions that CLOSE later -- which is this shape, since a closed region cannot
 * explain a live definition inside it any other way. Not implemented: extending this pass to
 * end on a label line needs the host definition's own boundary rules, which `definitionTrim`
 * and `definitionLazy` also touch, and the family is 15 documents.
 */
export function commentDefinitionExtentTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const definition = parent.children[index];
      if (definition?.type !== "footnoteDefinition") continue;

      const inner = (definition as FootnoteDefinition)
        .children as unknown as RootContent[];
      const comment = inner.find((child) => isComment(child));
      if (!isComment(comment)) continue;

      const from = comment.position?.start?.offset;
      const ownEnd = comment.position?.end?.offset;
      const end = definition.position?.end?.offset;
      const startLine = comment.position?.start?.line;
      if (
        from === undefined ||
        ownEnd === undefined ||
        end === undefined ||
        startLine === undefined
      ) {
        continue;
      }
      // Closed means a second `%%` after the opener; testing whether the span
      // ends with one reads an unclosed comment as closed, since the opener is
      // then the last thing in it.
      if (source.slice(from, ownEnd).slice(MARKER.length).includes(MARKER)) {
        continue;
      }

      const lines = source.slice(from, end).split("\n");
      const blank = lines.findIndex(
        (line, offset) => offset > 0 && BLANK.test(line),
      );
      if (blank === -1) continue;

      const kept = lines.slice(0, blank).join("\n");
      const cut = from + kept.length;
      comment.value = source.slice(from + MARKER.length, cut);
      if (comment.position) {
        comment.position.end = { ...comment.position.end, offset: cut };
      }
      delete comment.children;
      if (definition.position) {
        definition.position.end = { ...definition.position.end, offset: cut };
      }

      // Whatever sat past the blank line is its own block, beside the definition.
      const tailFrom = from + lines.slice(0, blank + 1).join("\n").length + 1;
      if (tailFrom >= end) continue;
      const map = mapLines(source, tailFrom, end, startLine + blank + 1);
      const tail = reparse(map.text);
      for (const child of tail.children) shiftByMap(child, map, 0);
      parent.children.splice(index + 1, 0, ...(tail.children as RootContent[]));
      index += tail.children.length;
    }
  });
}
