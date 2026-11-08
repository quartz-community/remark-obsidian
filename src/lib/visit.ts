import { convert, type Test } from "unist-util-is";
import type { visit as stockVisit } from "unist-util-visit";
import { visitParents, type VisitorResult } from "unist-util-visit-parents";
import type { Node, Parent } from "unist";

export { CONTINUE, EXIT, SKIP } from "unist-util-visit-parents";

type AnyVisitor = (
  node: Node,
  index: number | undefined,
  parent: Parent | undefined,
) => VisitorResult;

/**
 * `unist-util-visit`'s `visit`, but linear in a node's siblings.
 *
 * The stock function finds each visited node's index with `parent.children.indexOf(node)`, so a
 * paragraph of tens of thousands of inline nodes cost every pass that visits text a scan of the
 * paragraph per text: `"*a* ".repeat(32000)` spent about 0.5 s in each of ten passes. Here the
 * index is the one `visitParents` reads the child at, handed over through the test it runs on
 * that same child just before the visitor. The two agree whenever a node sits in its parent's
 * children once, which every tree this package builds holds.
 */
export const visit = function (
  tree: Node,
  testOrVisitor: Test | AnyVisitor,
  visitorOrReverse?: AnyVisitor | boolean | null,
  maybeReverse?: boolean | null,
): undefined {
  let test: Test;
  let visitor: AnyVisitor;
  let reverse: boolean | null | undefined;

  if (
    typeof testOrVisitor === "function" &&
    typeof visitorOrReverse !== "function"
  ) {
    test = undefined;
    visitor = testOrVisitor as AnyVisitor;
    reverse = visitorOrReverse;
  } else {
    test = testOrVisitor as Test;
    visitor = visitorOrReverse as AnyVisitor;
    reverse = maybeReverse;
  }

  const is = convert(test);
  let seat: number | undefined;

  visitParents(
    tree,
    (node: Node, index?: number, parent?: Parent) => {
      seat = index;
      return is(node, index, parent);
    },
    (node: Node, parents: Parent[]) =>
      visitor(node, seat, parents[parents.length - 1]),
    reverse,
  );
} as typeof stockVisit;
