import type { Heading, Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { span } from "./normalize-points.js";

interface ParentNode extends Node {
  children: RootContent[];
}

const UNDERLINE = /^[ \t]*(?:>[ \t]*)?(=+|-+)[ \t]*$/;
const QUOTE_PREFIX = /^[ \t]*>[ \t]?/;

/**
 * A setext underline under a footnote definition makes a heading of the whole
 * line, label included.
 *
 * `[^1]: x` followed by `===` is a heading reading `[^1]: x` in Obsidian, not a
 * definition. GFM gives the definition priority and swallows the underline as lazy
 * continuation, or — for `---` — leaves a thematic break behind, so both shapes
 * have to be recognised.
 *
 * The heading keeps the raw line rather than the definition's parsed content,
 * because the definition dropped `[^1]: ` as its label while Obsidian shows it.
 * Running before the bare-reference pass is what then reduces that to `1: `, and
 * leaves any reference that pointed at the vanished definition to be orphaned.
 */
export function setextDefinitionTransform(tree: Root, source: string): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<ParentNode>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const definition = parent.children[index];
      if (definition?.type !== "footnoteDefinition") continue;

      const start = definition.position?.start?.offset;
      let end = definition.position?.end?.offset;
      if (start === undefined || end === undefined) continue;

      let absorbed = 0;
      let lines = source.slice(start, end).split("\n");

      // Only a one-line definition is swallowed whole. Given a continuation line
      // the underline belongs to that line instead, so `[^1]: x` / `    y` / `--`
      // stays a definition and `[^1]: body` / `lazy` / `===` heads only `lazy`.
      const underlined =
        lines.length === 2 && UNDERLINE.test(lines[lines.length - 1]!);

      if (!underlined) {
        // `---` closes the definition and becomes a thematic break of its own.
        if (lines.length !== 1) continue;
        const next = parent.children[index + 1];
        const nextStart = next?.position?.start?.offset;
        const nextEnd = next?.position?.end?.offset;
        if (next?.type !== "thematicBreak") continue;
        if (nextStart === undefined || nextEnd === undefined) continue;
        if (source.slice(end, nextStart).trim() !== "") continue;
        if (!UNDERLINE.test(source.slice(nextStart, nextEnd))) continue;

        end = nextEnd;
        absorbed = 1;
        lines = source.slice(start, end).split("\n");
      }

      const marker = UNDERLINE.exec(lines[lines.length - 1]!)![1]!;
      const content = lines
        .slice(0, -1)
        .map((line) => line.replace(QUOTE_PREFIX, ""))
        .join("\n");

      // The bare-reference pass reads a label's written form out of the source
      // through its host's span, so a `[^1]` inside this heading is placeable
      // only if the text carrying it is. The span ends before the underline,
      // the one line the heading's text does not include.
      const contentEnd = start + lines.slice(0, -1).join("\n").length;
      const heading: Heading = {
        type: "heading",
        depth: marker.startsWith("=") ? 1 : 2,
        children: [
          span<Text>(
            { type: "text", value: content } as Text,
            source,
            start,
            contentEnd,
          ),
        ],
      };
      if (definition.position) {
        heading.position = {
          start: { ...definition.position.start },
          end: {
            ...(parent.children[index + absorbed]!.position?.end ??
              definition.position.end),
          },
        };
      }

      parent.children.splice(index, 1 + absorbed, heading);
    }
  });
}
