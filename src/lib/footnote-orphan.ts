import type { Root, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface ParentNode extends Node {
  children: Node[];
}

interface ReferenceNode extends Node {
  type: "footnoteReference";
  identifier: string;
  label?: string;
}

/**
 * Bare a footnote reference whose definition no longer exists.
 *
 * GFM binds references to definitions while parsing, so a reference keeps its
 * node even after an earlier transform folds the definition away — which is
 * exactly what happens when a definition turns out to be lazy continuation of
 * the paragraph above it. Obsidian never saw a definition there, so it renders
 * the reference as its bare name, the same as any other unresolved one.
 *
 * Must run after every transform that can remove a definition, and after
 * `bareFootnoteRefTransform`, which only ever sees references left as text.
 */
export function footnoteOrphanTransform(tree: Root): void {
  const defined = new Set<string>();
  visit(tree, "footnoteDefinition", (node: Node) => {
    defined.add(String((node as { identifier?: string }).identifier ?? ""));
  });

  visit(
    tree,
    "footnoteReference",
    (node: Node, index: number | undefined, parent: ParentNode | undefined) => {
      if (!parent || typeof index !== "number") return;
      const reference = node as ReferenceNode;
      if (defined.has(String(reference.identifier))) return;

      const bare: Text = {
        type: "text",
        value: reference.label ?? reference.identifier,
        ...(reference.position ? { position: reference.position } : {}),
      };
      parent.children.splice(index, 1, bare);
    },
  );
}
