import type { Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/**
 * A definition buried in a `%%` comment starts at its LABEL, not at its line.
 *
 * Obsidian buries such a definition and indexes its label as a REFERENCE -- the rule worth +123
 * documents -- and that reference sits at the label's bracket. Confirmed live through
 * `ask.mts --synth`, matching the referee's recorded answers on all four shapes:
 *
 *     %%       / [^1]: def       / %%        ref 1@1:0
 *     - %%     / ⟨2sp⟩[^1]: def  / ⟨2sp⟩%%   ref 1@1:2
 *     - item   / ⟨2sp⟩%% / ⟨2sp⟩[^1]: def    ref 1@2:2
 *     +⟨2sp⟩%% / blank / ⟨3sp⟩[^1]: Definition  ref 1@2:3
 *
 * We reported column 0 for all four, which is right only where the bracket happens to be there.
 *
 * WHY IT HAPPENS, because the cause is two passes away from the symptom. `commentParseTransform`
 * re-parses a comment's body through this plugin's own chain, and that chain includes
 * `definitionColumnTransform` -- which clamps a whitespace-prefixed definition to its block's
 * content column, and inside a FRAGMENT there is no list item to be the block, so it clamps to
 * zero. `shiftByMap` then faithfully places the node at the line start it was given. Every step
 * is correct in isolation; the fragment simply cannot see the container it came from.
 *
 * So the repair is here rather than in either of them: after the body is parsed, a buried
 * definition's start is moved back to the `[^` on its own line. Offsets only -- the column and
 * line are rebuilt by `normalizePointsTransform`, which runs after this.
 */
export function commentDefinitionColumnTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;

  visit(tree, "comment", (host: Node) => {
    visit(host, (node: Node) => {
      if (node === host) return;
      if (node.type !== "footnoteDefinition" && node.type !== "definition") {
        return;
      }
      const start = node.position?.start;
      if (!start || start.offset === undefined) return;

      const bol = source.lastIndexOf("\n", start.offset - 1) + 1;
      const lineEnd = source.indexOf("\n", bol);
      const line = source.slice(bol, lineEnd === -1 ? undefined : lineEnd);
      // The label this node is for, found from the line rather than from the node's own span:
      // the span is exactly what is wrong here.
      const bracket = line.indexOf("[^");
      if (bracket === -1) return;
      // Only ever forward, and only within the node's own line. A definition already at its
      // bracket needs nothing, and one whose label sits before its recorded start is a
      // different defect than this.
      const moved = bol + bracket;
      if (moved <= start.offset) return;
      if (
        node.position!.end.offset !== undefined &&
        moved >= node.position!.end.offset
      ) {
        return;
      }
      start.offset = moved;
    });
  });
}
