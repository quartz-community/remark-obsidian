import type { List, ListItem, Paragraph, Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { span } from "./normalize-points.js";

/** A run of markers separated only by spaces and tabs, with at least one tab. */
const SEPARATED = /^([*\-_])(?:[ \t]*\1)+[ \t]*$/u;

/**
 * A tab between thematic-break markers cancels the break.
 *
 * `remark-parse@8`'s tokenizer accepts only spaces between the markers, so a tab
 * drops the line to the list tokenizer and it becomes nested items instead.
 * Obsidian agrees with the legacy stack on every variant probed, against
 * CommonMark -- which counts a tab as whitespace and reports a break:
 *
 *     * * *        a thematic break to both
 *     *  *  *      still a break: more spaces are fine
 *     ***          still a break: no separator at all
 *     *⇥*⇥*⇥       three nested lists, `ul,ul,ul`
 *     * * *⇥       a *trailing* tab alone cancels it
 *     -⇥-⇥-⇥       the same for dashes
 *     _⇥_⇥_⇥       a paragraph, since `_` is not a list marker
 *
 * Done here rather than in the tokenizer, and the reason is worth recording.
 * `thematicBreak` is reachable two ways: registered in `flow`, and imported
 * *directly* by `list`, which runs `effects.check(thematicBreak, nok, atMarker)` to
 * avoid claiming `- - -`. A replacement construct can only reach the first, so the
 * list would still see stock's verdict, still decline, and the line would come out a
 * paragraph rather than the nested items Obsidian reports. Replacing `list` as well
 * means porting its continuation logic, which seven cases do not justify.
 *
 * Only a break whose own source holds a tab is touched, so every ordinary thematic
 * break in the corpus is left exactly as it was.
 */
export function thematicBreakTabTransform(tree: Root, source: string): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const brk = parent.children[index];
      if (brk?.type !== "thematicBreak") continue;

      const from = brk.position?.start?.offset;
      const to = brk.position?.end?.offset;
      if (from === undefined || to === undefined) continue;

      const line = source.slice(from, to);
      if (!line.includes("\t")) continue;
      const matched = SEPARATED.exec(line);
      if (!matched) continue;

      // `_` opens no list, so the line is simply prose. The tabs stay in the value:
      // the tree records the source and the projection is what collapses them, which
      // is how Obsidian comes to report `_ _ _`.
      if (matched[1] === "_") {
        parent.children.splice(index, 1, {
          type: "paragraph",
          children: [
            span<Text>({ type: "text", value: line } as Text, source, from, to),
          ],
          position: { ...brk.position! },
        } as Paragraph);
        continue;
      }

      const markers: number[] = [];
      for (let at = 0; at < line.length; at++) {
        if (line[at] === matched[1]) markers.push(from + at);
      }
      if (markers.length < 3) continue;

      // Each marker opens an item inside the one before it, and every container runs
      // to the end of the line -- which is what `computeMetadataAsync` reports:
      // three items at the three marker columns, each ending where the line does.
      let built: List | undefined;
      for (let depth = markers.length - 1; depth >= 0; depth--) {
        const at = markers[depth]!;
        const item: ListItem = {
          type: "listItem",
          spread: false,
          checked: null,
          children: built ? [built] : [],
          position: {
            start: { line: 0, column: 1, offset: at },
            end: { line: 0, column: 1, offset: to },
          },
        };
        built = {
          type: "list",
          ordered: false,
          start: null,
          spread: false,
          children: [item],
          position: {
            start: { line: 0, column: 1, offset: at },
            end: { line: 0, column: 1, offset: to },
          },
        };
      }
      if (built) parent.children.splice(index, 1, built);
    }
  });
}
