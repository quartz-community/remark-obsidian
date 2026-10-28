import type { Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { SKIP, visit } from "unist-util-visit";
import { insideAutolink } from "./footnote-bare.js";
import { decodeString } from "micromark-util-decode-string";
import { paragraphSlice } from "./line-map.js";

interface ParentNode extends Node {
  children: RootContent[];
}

/**
 * A `[^` before an inline footnote's `^[` is a reference opener, and wins.
 *
 * `[^[^1]` is a footnote *reference* whose label runs to the first `]`, so the label is
 * `[^1` and -- nothing defining it -- it renders as its own bare text. We build an
 * inline footnote instead, because `^[` opens one and our construct sees that `^`
 * first:
 *
 *     ][^[^1]](      obs `][^1](`      we had `][⟨fn⟩](`
 *     ·[^[^1]·       obs `[^1`         we had `[⟨fn⟩`
 *
 * Nothing is counted: the label is everything up to the first `]`, brackets included,
 * which is the recorded footnote-label rule and the reason `bracketLabelReferences`
 * closed 17 of the 18 cases in this family. These are the last two.
 *
 * A repair rather than a tokenizer guard, because the guard is already refuted:
 * declining `^[` after a `[` costs `context/link-label/inline-footnote` and lets the
 * *wikilink* win instead, so `[^[[a]]]` becomes a link to `a` where Obsidian reports
 * the literal `[[a]]` and no link. The tree can ask what the bracket belongs to; the
 * tokenizer cannot, at the point it has to decide.
 *
 * Both recorded cases are the target and there are no controls, which is what keeps the
 * shape tight: the previous sibling must be text ending in the opener's own `[`, and
 * the closer must sit inside the same block.
 */
export function doubledFootnoteOpenerTransform(
  tree: Root,
  source: string,
  options: { readonly bareFootnoteRefs: boolean },
): void {
  if (source === "") return;
  // A reference to a label nothing defines is literal text unless bare references are on, as
  // GFM has it: Obsidian's rule is that `[^` wins over `^[`, not that every label is defined.
  const defined = new Set<string>();
  visit(tree, "footnoteDefinition", (node) => {
    defined.add(node.identifier.toLowerCase());
  });

  visit(tree, (node: Node) => {
    // An autolink's address holds no reference, as in `bareFootnoteRefTransform`.
    if (insideAutolink(node, source)) return SKIP;
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;
    const kids: RootContent[] = parent.children;
    const limit = (node as Node).position?.end?.offset ?? source.length;

    for (let index = kids.length - 1; index >= 1; index--) {
      if (kids[index]?.type !== "footnote") continue;
      const before = kids[index - 1];
      if (before?.type !== "text" || !before.value.endsWith("[")) continue;

      const prevEnd = before.position?.end?.offset;
      const noteEnd = kids[index]!.position?.end?.offset;
      if (prevEnd === undefined || noteEnd === undefined) continue;

      const openAt = prevEnd - 1;
      if (source[openAt] !== "[" || source[openAt + 1] !== "^") continue;

      const labelFrom = openAt + 2;
      const closeAt = source.indexOf("]", labelFrom);
      if (closeAt === -1 || closeAt >= limit) continue;
      const label = source.slice(labelFrom, closeAt);
      // A footnote label holds no whitespace (`[^a b]` is text), so one reaching past a line
      // ending is no reference. Taking it anyway sliced the next line's container prefix into
      // the label, and every format wrote that prefix out again: `> [^[[a` / `> b]]]` inside a
      // definition gained a `>` per pass (found by `fuzz/invariant-sweep.ts`).
      if (label === "" || /\s/u.test(label)) continue;
      if (!options.bareFootnoteRefs && !defined.has(label.toLowerCase())) {
        // No reference, and no inline footnote either: its `^[` and `]` are text again, and
        // what it held stays as parsed. Rebuilt as one text slice of the source, it lost every
        // construct inside: `[^[^<https://e.test>]]` kept the address as text, which GFM links
        // when the formatted document is read back (about 260 seeds of the million-seed
        // census, under "formatting keeps the tree").
        // Only children that sit inside the brackets and hold no other note: a nested
        // `[^[^[^1]]` or a label the inline scan placed across the `^[` keeps the text slice
        // (423 + 51 seeds of the census that checked this).
        const inner =
          (kids[index] as { children?: RootContent[] }).children ?? [];
        const contained = inner.every((child) => {
          const from = child.position?.start?.offset;
          const to = child.position?.end?.offset;
          let note = false;
          visit(child, (n: Node) => {
            if (n.type === "footnote" || n.type === "footnoteReference") {
              note = true;
            }
          });
          return (
            !note &&
            from !== undefined &&
            to !== undefined &&
            from >= openAt + 3 &&
            to <= noteEnd - 1
          );
        });
        if (!contained) {
          kids.splice(index, 1, {
            type: "text",
            // Decoded, as micromark decodes text: a raw slice kept escapes' backslashes, which
            // the writer escaped again on every format, doubling them -- `# [^[[link](u)]`
            // under Quartz's options grew without bound (found by `fuzz/invariant-sweep.ts`).
            value: decodeString(
              paragraphSlice(source.slice(openAt + 1, noteEnd)),
            ),
            position: {
              start: { line: 0, column: 1, offset: openAt + 1 },
              end: { line: 0, column: 1, offset: noteEnd },
            },
          } as Text);
          continue;
        }
        const piece = (value: string, from: number, to: number): Text =>
          ({
            type: "text",
            value,
            position: {
              start: { line: 0, column: 1, offset: from },
              end: { line: 0, column: 1, offset: to },
            },
          }) as Text;
        kids.splice(
          index,
          1,
          piece("^[", openAt + 1, openAt + 3),
          ...inner,
          piece("]", noteEnd - 1, noteEnd),
        );
        continue;
      }

      const reference = {
        type: "footnoteReference",
        identifier: label.toLowerCase(),
        label,
        position: {
          start: { line: 0, column: 1, offset: openAt },
          end: { line: 0, column: 1, offset: closeAt + 1 },
        },
      } as unknown as RootContent;

      // The opener leaves the text that held it.
      before.value = before.value.slice(0, -1);
      if (before.position) {
        before.position.end = { ...before.position.end, offset: openAt };
      }

      const replacement: RootContent[] = [reference];
      // Anything the inline footnote covered past the reference's closer is content
      // again, which is what keeps `](` in `][^[^1]](`.
      if (noteEnd > closeAt + 1) {
        replacement.push({
          type: "text",
          value: decodeString(
            paragraphSlice(source.slice(closeAt + 1, noteEnd)),
          ),
          position: {
            start: { line: 0, column: 1, offset: closeAt + 1 },
            end: { line: 0, column: 1, offset: noteEnd },
          },
        } as Text);
      }
      kids.splice(index, 1, ...replacement);
      if (before.value === "") kids.splice(index - 1, 1);
    }
  });
}
