import type { Root, RootContent, Text } from "mdast";
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
/** A label pair at the very start of a text node, followed by another opener. */
const LEADING_PAIR = /^\[([^\][]+)\]\[/u;

/**
 * Once the bracket after a closer is a label opener, the pair before it resolves.
 *
 * `[foo][ref[]` over `[foo]: /other` renders `fooref[]` with `foo` linked to `/other`:
 * the `[` after the closer opens a label for `[foo]`, that label is undefined so it
 * shows bare, and `[foo]` itself is left as a shortcut reference -- which resolves.
 * The recorded html is explicit, `<a href="/other">foo</a>ref[]`.
 *
 * Only a defined label is promoted, which is the same restraint `pushTail` applies for
 * the same reason: an undefined one renders as its own text anyway, and promoting it
 * would invent a node for characters no construct claimed. The four sibling probes with
 * nothing defined all match without this.
 *
 * A tree change rather than a projection one, unlike the bracket-drop this pairs with.
 * Obsidian does not drop a character here -- it builds a link -- so the node belongs in
 * the tree, and `links` has to see it.
 */
function promoteResolvedPair(
  kids: RootContent[],
  index: number,
  source: string,
  defined: ReadonlySet<string>,
): boolean {
  const node = kids[index];
  if (node?.type !== "text") return false;
  const match = LEADING_PAIR.exec(node.value);
  const label = match?.[1];
  if (!match || label === undefined) return false;
  if (!defined.has(label.toLowerCase())) return false;

  const from = node.position?.start?.offset;
  const to = node.position?.end?.offset;
  if (from === undefined || to === undefined) return false;
  // The written label, so an escape in it survives as the author wrote it.
  const written = source.slice(from + 1, from + 1 + label.length);
  const closer = from + 1 + label.length + 1;

  const reference = {
    type: "linkReference",
    identifier: label.toLowerCase(),
    label: written,
    referenceType: "shortcut",
    children: [
      {
        type: "text",
        value: written,
        position: {
          start: { line: 0, column: 1, offset: from + 1 },
          end: { line: 0, column: 1, offset: from + 1 + label.length },
        },
      } as Text,
    ],
    position: {
      start: { ...node.position!.start },
      end: { line: 0, column: 1, offset: closer },
    },
  } as unknown as RootContent;

  const rest: RootContent[] = [reference];
  // Past the label opener, which is the character Obsidian consumes.
  const tail = node.value.slice(match[0].length);
  if (tail !== "") {
    rest.push({
      type: "text",
      value: tail,
      position: {
        start: { line: 0, column: 1, offset: closer + 1 },
        end: { ...node.position!.end },
      },
    } as Text);
  }
  kids.splice(index, 1, ...rest);
  return true;
}

export function labelOpenerWikilinkTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  const defined = new Set<string>();
  visit(tree, "definition", (node: Node) => {
    defined.add(
      String(
        (node as unknown as { identifier: string }).identifier,
      ).toLowerCase(),
    );
  });

  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;

    const kids: RootContent[] = parent.children;
    for (let index = kids.length - 1; index >= 0; index--) {
      if (promoteResolvedPair(kids, index, source, defined)) continue;
    }
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
