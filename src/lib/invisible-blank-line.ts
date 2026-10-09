import type { Paragraph, Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/** Whitespace that is not a space or a tab, so a no-break space and its relatives. */
const INVISIBLE_ONLY = /^\s+$/u;
const ASCII_BLANK = /^[ \t]*$/u;

/**
 * A line of invisible whitespace ends the block above it and becomes its own paragraph.
 *
 * A no-break space is whitespace to `remark-parse@8`'s blank-line test but is not
 * nothing, so the line closes whatever was open and then renders as a paragraph of its
 * own. The arbiter is unambiguous across six shapes:
 *
 *     > [li / ⟨nbsp⟩     blockquote + paragraph    <- the line leaves the quote
 *     > [li / ⟨space⟩    blockquote                <- an ASCII blank just ends it
 *     > [li / x          blockquote                <- an ordinary lazy continuation
 *     a / ⟨nbsp⟩         paragraph + paragraph     <- it breaks a paragraph too
 *     ⟨nbsp⟩             paragraph
 *
 * Obsidian agrees: `> [li` over a no-break space renders
 * `<blockquote><p>[li</p></blockquote> <p>&nbsp;</p>`.
 *
 * micromark takes the line as an ordinary lazy continuation, so the quote's paragraph
 * swallows it and nothing is left at root. The split is undone here rather than in the
 * tokenizer because the line's own blankness is what decides it, and that is a property
 * of the source rather than of any construct.
 *
 * Zero corpus controls, stated plainly: one recorded case carries a line of invisible
 * whitespace, and the three others that look similar are `\r` from CRLF endings. The
 * arbiter table above is what carries the rule, and the split is held to the shape it
 * covers -- the line must be the paragraph's last, so nothing after it has to be
 * re-homed.
 */
export function invisibleBlankLineTransform(tree: Root, source: string): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = parent.children.length - 1; index >= 0; index--) {
      const child = parent.children[index];
      if (child?.type !== "paragraph") continue;

      const from = child.position?.start?.offset;
      const to = child.position?.end?.offset;
      if (from === undefined || to === undefined) continue;

      const lines = source.slice(from, to).split("\n");
      const last = lines[lines.length - 1] ?? "";
      // The paragraph's final line, and invisible rather than empty.
      if (lines.length < 2) continue;
      if (!INVISIBLE_ONLY.test(last) || ASCII_BLANK.test(last)) continue;

      const cut = to - last.length;
      // Children wholly before the cut stay. One may *cross* it, and usually does:
      // `remark-breaks` runs after this package, so at this point the paragraph is a
      // single text node spanning every line it holds rather than text/break/text.
      // Filtering alone therefore kept nothing and the pass never fired.
      const kept: RootContent[] = [];
      for (const inner of child.children) {
        const at = inner.position?.end?.offset;
        const startsAt = inner.position?.start?.offset;
        if (at === undefined || startsAt === undefined) continue;
        if (at <= cut) {
          kept.push(inner);
          continue;
        }
        if (startsAt >= cut || inner.type !== "text") continue;
        // Trailing line endings go with the line that closed the block, not with
        // the text that stays.
        let stop = cut;
        while (stop > startsAt && source[stop - 1] === "\n") stop -= 1;
        if (stop <= startsAt) continue;
        inner.value = source.slice(startsAt, stop);
        inner.position = {
          start: { ...inner.position!.start },
          end: { line: 0, column: 1, offset: stop },
        };
        kept.push(inner);
      }
      if (kept.length === 0) continue;
      const end = kept[kept.length - 1]?.position?.end;
      if (end?.offset === undefined || end.offset >= to) continue;

      child.children = kept as Paragraph["children"];
      if (child.position) child.position.end = { ...end };

      const paragraph: Paragraph = {
        type: "paragraph",
        children: [
          {
            type: "text",
            value: last,
            position: {
              start: { line: 0, column: 1, offset: cut },
              end: { line: 0, column: 1, offset: to },
            },
          },
        ],
        position: {
          start: { line: 0, column: 1, offset: cut },
          end: { line: 0, column: 1, offset: to },
        },
      };

      // At root, because the line carries no container prefix: it is what closed the
      // container rather than content inside it.
      if (parent === (tree as unknown as { children: RootContent[] })) {
        parent.children.splice(index + 1, 0, paragraph);
      } else {
        tree.children.push(paragraph);
      }
      // And the container's own span stops where its content now does.
      if (
        node !== (tree as unknown as Node) &&
        (node as Node).position &&
        end
      ) {
        (node as Node).position!.end = { ...end };
      }
    }
  });
}
