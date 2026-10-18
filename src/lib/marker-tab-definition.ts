import type { Root, RootContent } from "mdast";
import type { Node } from "unist";

/** A marker, a TAB, at most three further spaces, then a label. */
const MARKER_TAB_LABEL = /^[ \t]*(?:[-*+]|\d{1,9}[.)])\t {0,3}\[\^[^\]]*\]:/u;
/** The same, capturing the leading indent and the marker so their widths can be summed. */
const MARKER_WIDTH = /^([ \t]*)((?:[-*+]|\d{1,9}[.)]))\t {0,3}\[\^/u;

interface ParentNode extends Node {
  children: RootContent[];
}

/**
 * A marker followed by a TAB and up to three spaces still opens a DEFINITION, not code.
 *
 * The largest cluster of the `def-miss @ code` shrink -- 34 minimal forms over 50 documents --
 * and every short one is this shape with the label on the marker's own line. Earlier waves only
 * ever put the label on a LATER line, so the separator axis had never been probed. 48 probes,
 * six markers by eight separators:
 *
 *     marker     tab     tab1    tab2    tab3    tab4    1sp     2sp
 *     `-`        2/2     2/2     2/-     2/-     -/-     2/2     3/3
 *     `10.`      4/4     4/4     4/4     4/4     -/-     4/4     5/5
 *     `⟨3sp⟩-`   5/5     5/-     5/-     5/-     -/-     5/5     6/6
 *     `⟨2sp⟩10.` 6/6     6/6     6/-     6/-     -/-     6/6     7/7
 *
 * Left digit Obsidian, right ours. A tab plus up to three spaces DEFINES, at the leading indent
 * plus the marker's width plus one; tab plus four is code on both sides. We stop two columns
 * early. The `10.` row agreeing throughout and the `tab4` column agreeing throughout are the
 * controls -- this is a SEPARATOR rule, not a fact about tabs or about wide markers.
 *
 * ROOT-LEVEL ITEMS ONLY, which is derived and not fitted. Unrestricted the rule scores
 * `better 15 / worse 28` for -8, and its losses are nested markers: `- amet...` over
 * `⟨2sp⟩2)⇥[^Note]:` has Obsidian defining NOTHING, while an equally indented marker at root
 * defines at column 5 in the table above. The probes only ever placed the marker at root, so
 * the nested case was never measured and the rule may not claim it. Restricted it scores
 * `better 11 / worse 2` for +10.
 *
 * The repair is a RE-PARSE of the code node's own value, which is already de-indented to
 * exactly the definition's text -- `-⇥⟨2sp⟩[^Note]: def` leaves `code` holding
 * `"[^Note]: def"`. Only OFFSETS are set, because `normalizePointsTransform` rebuilds line and
 * column from them downstream and this file's standing rule is to touch offsets before it runs.
 */
export function markerTabDefinitionTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  const lines = source.split("\n");
  for (const list of tree.children) {
    if (list.type !== "list") continue;
    for (const item of (list as unknown as ParentNode).children) {
      const holder = item as unknown as ParentNode;
      if (!Array.isArray(holder.children)) continue;
      // ANY code child whose own line carries the shape, not merely the first. This is the
      // general form and it measures EXACTLY THE SAME as `children[0]` -- both 5829 -- so it
      // is kept for correctness rather than for a gain, and the note is here so nobody reads
      // the generality as evidence of one.
      //
      // The gap to the candidate's +10 is NOT here, and was looked for here first. The scorer
      // adds a definition by line scan wherever the shape appears; this pass needs a `code`
      // node inside a root list item to replace, and the remaining documents do not present
      // one. That difference is the same class as the pass-ordering finding above: a score
      // locates a rule, not the tree shape that carries it.
      const slot = holder.children.findIndex((child) => {
        if ((child as Node).type !== "code") return false;
        const at = (child as Node).position?.start?.line;
        return at !== undefined && MARKER_TAB_LABEL.test(lines[at - 1] ?? "");
      });
      if (slot === -1) continue;
      const first = holder.children[slot] as Node;
      const line = first.position?.start?.line;
      if (line === undefined) continue;

      // The code node's value keeps whatever indent exceeded the stripped four columns, so
      // `+⇥⟨3sp⟩[^1]: def` arrives as `" [^1]: def"` with a leading space while `-⇥⟨2sp⟩`
      // arrives clean. Guarding on `startsWith("[^")` therefore caught only the narrowest
      // separator and silently skipped the rest of the family -- tab+3 and every
      // leading-indented marker.
      const raw = (first as unknown as { value?: string }).value ?? "";
      const value = raw.replace(/^ +/u, "");
      if (!value.startsWith("[^")) continue;

      // Where the label actually begins, which is NOT the code node's start: the node starts
      // at the item's content column and the value has its indent stripped, so the two differ
      // by exactly the spaces after the tab.
      const from = source.indexOf(value, first.position?.start?.offset ?? 0);
      if (from === -1) continue;

      const parsed = reparse(value);
      const definition = parsed.children[0];
      if (definition?.type !== "footnoteDefinition") continue;

      shift(definition as unknown as Node, from);
      // The definition STARTS at the item's content column, not at the bracket. Letting the
      // offset fall where `[` sits reports column 4 for `-⇥⟨2sp⟩[^Note]:` where Obsidian
      // reports 2, so the node is created and still disagrees -- which is how this pass
      // measured inert on its first run. `definitionColumnTransform` would normally settle
      // this, and it runs earlier than this pass must, so the column is set here from the
      // formula the probe table gives: leading indent, plus the marker's width, plus one.
      //
      //     `-⇥⟨2sp⟩[^Note]:`      0 + 1 + 1 = 2   obs 2
      //     `⟨3sp⟩-⇥⟨1sp⟩[^1]:`    3 + 1 + 1 = 5   obs 5
      //     `⟨2sp⟩10.⇥⟨2sp⟩[^名]:` 2 + 3 + 1 = 6   obs 6
      const opener = MARKER_WIDTH.exec(lines[line - 1] ?? "");
      const at = definition.position;
      if (opener && at) {
        const lineStart = from - (lines[line - 1] ?? "").indexOf(value);
        at.start.offset = lineStart + opener[1]!.length + opener[2]!.length + 1;
      }
      holder.children[slot] = definition;
    }
  }
}

/** Move a node and its descendants by a flat offset, offsets only. */
function shift(node: Node, by: number): void {
  const at = node.position;
  if (at) {
    at.start.offset = (at.start.offset ?? 0) + by;
    at.end.offset = (at.end.offset ?? 0) + by;
  }
  for (const child of ((node as ParentNode).children ?? []) as Node[]) {
    shift(child, by);
  }
}
