import type { Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { shiftAll } from "./label-precedence.js";

interface ParentNode extends Node {
  children: RootContent[];
}

/**
 * A `[` straight after a `]` opens a link label, so it is not a wikilink opener.
 *
 * `a [x][[w]] b` renders `a [x][w]] b` in Obsidian and indexes no link: the first
 * bracket of the `[[` is taken as a label opener for the text that just closed, and
 * what follows it is ordinary content. We claimed a wikilink to `w` instead.
 *
 * The discriminator is what the `]` closed, and the probes separate it cleanly. After a
 * footnote reference (`a[^1][[w]]`), after another wikilink (`[[a]][[b]]`) and after an
 * inline footnote (`^[a][[w]]`) the `[[` *does* open a wikilink, and all three match --
 * so this asks for a preceding **text** node, which is exactly the case where the
 * bracket pair was plain content. A tokenizer guard cannot make that distinction at the
 * opener, which is why declining on any preceding `]` cost three cases.
 *
 * An embed is excluded by the rule rather than by exception: in `[a#h]]![[d.pdf]]` the
 * `!` sits between the `]` and the `[`, so no bracket is *immediately* after the closer
 * and `fuzz/embed/54` keeps its embed.
 *
 * The remainder is re-parsed rather than kept as literal text, because the label can
 * hold a construct: `a [text][[^9]] b` over `[^9]: def` leaves `[^9]]`, whose footnote
 * reference Obsidian indexes.
 */
export function labelOpenerWikilinkTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;

    const kids: RootContent[] = parent.children;
    for (let index = kids.length - 1; index >= 1; index--) {
      const child: RootContent = kids[index]!;
      if (child.type !== "wikilink") continue;

      const from = child.position?.start?.offset;
      const to = child.position?.end?.offset;
      if (from === undefined || to === undefined) continue;
      // Only a bare `[[`. An embed's `!` means the bracket is not against the closer.
      if (source[from] !== "[") continue;

      const before = kids[index - 1];
      if (before?.type !== "text") continue;
      const value = before.value;
      if (!value.endsWith("]") || !value.includes("[")) continue;

      const parsed = reparse(source.slice(from + 1, to));
      const body = parsed.children[0];
      if (parsed.children.length !== 1 || body?.type !== "paragraph") continue;
      const children = body.children as RootContent[];
      shiftAll(children, from + 1);
      kids.splice(index, 1, ...children);
    }
  });
}
