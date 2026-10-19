import type { Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

const EMPTY_QUOTE = /^[ \t]*>[ \t]*$/u;
const CALLOUT = /^[ \t]*>[ \t]*\[![^\]]+\]/u;
const QUOTED_TAB = /^[ \t]*>\t/u;

/**
 * A quoted TAB line is indented code when the quoted line above it opened a block.
 *
 *     ">" / ">⇥code[^2]"            obs indexes NO reference, we indexed one
 *     "> [!note]" / ">⇥code[^2]"    the same
 *     "> plain" / ">⇥code[^2]"      obs DOES index it -- the control
 *
 * It is LAZY CONTINUATION and not anything about callouts, which is the correction this rule
 * waited on. After `> plain` the tabbed line continues an open paragraph and the reference is
 * indexed. After an EMPTY `>` or a callout title there is no open paragraph, so the tabbed
 * line starts a fresh block, a tab is four columns, and the line is indented code whose
 * brackets are literal.
 *
 * REFUSED ONCE ON SIZE AND THAT FIGURE WAS WRONG. It was declined at "four documents", counted
 * on the corpus; the referee puts the population at fourteen and the rule at **+10 agreeing
 * documents, 12 better against 2 worse**. The lesson is narrow and worth keeping: a size
 * refusal is only as good as the corpus it was counted on, and this one was counted on the
 * oracle that happens to hold fewest of these shapes.
 *
 * The reference becomes TEXT carrying its own source characters rather than being deleted.
 * Indented code is literal, so the brackets survive in the document and a formatter rewriting
 * this line cannot lose them -- the same reason a dangling reference stays in the tree.
 */
export function quotedTabCodeTransform(tree: Root, source: string): void {
  if (source === "") return;

  const lines = source.split("\n");
  const dead = new Set<number>();
  for (let line = 1; line < lines.length; line++) {
    if (!QUOTED_TAB.test(lines[line] ?? "")) continue;
    const above = lines[line - 1] ?? "";
    if (EMPTY_QUOTE.test(above) || CALLOUT.test(above)) dead.add(line + 1);
  }
  if (dead.size === 0) return;

  // NOT INSIDE AN OPEN DEFINITION, which `hunt/quoted-definition-tab-continuation/0` is:
  //
  //     "para." / blank / "> [^9]: stray" / ">" / ">⇥body cites[^b]"
  //       obs footnotes    9@2:2-4:16     -- the definition reaches the tab line
  //       obs footnoteRefs b@4:12         -- so the reference IS indexed
  //
  // An empty `>` does not start a fresh block when a definition is still open above it: the
  // definition continues across the blank quoted line and the tab line is its content, which
  // is ordinary continuation rather than indented code. Derived from the oracle's own
  // `footnotes` span, and the premise is read from OUR TREE rather than re-scanned from the
  // source, which is the standing rule for a structural premise.
  const inDefinition = new Set<number>();
  visit(tree, "footnoteDefinition", (node: Node) => {
    const from = node.position?.start?.line;
    const to = node.position?.end?.line;
    if (from === undefined || to === undefined) return;
    for (let line = from; line <= to; line++) inDefinition.add(line);
  });

  visit(tree, "footnoteReference", (node: Node, index, parent) => {
    if (!parent || typeof index !== "number") return;
    const at = node.position?.start?.line;
    if (at !== undefined && inDefinition.has(at)) return;
    const from = node.position?.start?.offset;
    const to = node.position?.end?.offset;
    if (at === undefined || from === undefined || to === undefined) return;
    if (!dead.has(at)) return;

    (parent as unknown as { children: RootContent[] }).children[index] = {
      type: "text",
      value: source.slice(from, to),
      position: { ...node.position! },
    } as Text;
  });
}
