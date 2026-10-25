import type { Heading, Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { span } from "./normalize-points.js";

interface ParentNode extends Node {
  children: RootContent[];
}

const UNDERLINE = /^[ \t]*(?:>[ \t]*)?(=+|-+)[ \t]*$/;

interface ShiftPoint {
  line: number;
  column: number;
  offset?: number;
}

function rebuild(
  source: string,
  headEnd: number,
  end: number,
  reparse: (markdown: string) => Root,
): RootContent[] {
  const from = headEnd + 1;
  if (from >= end) return [];

  const slice = source.slice(from, end);
  if (slice.trim() === "") return [];

  const parsed = reparse(slice);
  const lines = source.slice(0, from).split("\n").length - 1;
  for (const child of parsed.children) shift(child, from, lines);
  return parsed.children;
}

function shift(node: unknown, offset: number, lines: number): void {
  const candidate = node as {
    position?: { start: ShiftPoint; end: ShiftPoint };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.line += lines;
      if (point.offset !== undefined) point.offset += offset;
    }
  }
  for (const child of candidate.children ?? []) shift(child, offset, lines);
}
/** A hyphen run with NO trailing whitespace, which is what keeps it from being a marker. */
const STRICT_UNDERLINE = /^ {0,3}-+$/u;
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
export function setextDefinitionTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
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

      // The underline has to come DIRECTLY after the label line. Given a continuation
      // line first it belongs to that line instead, so `[^1]: x` / `    y` / `--`
      // stays a definition and `[^1]: body` / `lazy` / `===` heads only `lazy`.
      //
      // Lines AFTER the underline are re-parsed below rather than folded into the
      // heading. Requiring the underline to be LAST missed `[^1]: x` / `===` /
      // `    chunk`, where the definition absorbs the indented line and Obsidian
      // reads it as root indented code -- 3 documents, measured 3 gain / 0 break.
      let underlineAt = UNDERLINE.test(lines[1] ?? "") ? 1 : -1;

      if (underlineAt === -1) {
        // `---` closes the definition and becomes a thematic break of its own.
        if (lines.length !== 1) continue;
        const next = parent.children[index + 1];
        const nextStart = next?.position?.start?.offset;
        const nextEnd = next?.position?.end?.offset;
        // A THIRD node type the underline arrives as, and the one this pass was missing.
        // A single `-` is a bullet marker to the legacy reader, so it builds an empty `list`
        // rather than a `thematicBreak`, and `[^1]: x` / `-` kept its definition where
        // Obsidian reports a heading. Four probes against 1.14.4, and the discriminator is
        // TRAILING WHITESPACE:
        //
        //     [^1]: Definition / -         heading@0-1                   defs=[]
        //     [^1]: Definition / --        heading@0-1                   defs=[]
        //     [^1]: Definition / `- `      footnoteDefinition + list@1-1 defs=["1"]
        //     [^1]: Definition / ⟨2sp⟩-⇥   footnoteDefinition + list@1-1 defs=["1"]
        //
        // A marker needs whitespace after it to be a marker, so a hyphen run with nothing
        // behind it is an underline and one with a space or tab behind it is a real list.
        // `UNDERLINE` deliberately admits trailing whitespace for the absorbed and
        // thematic-break spellings, both of which are measured and shipped, so the list
        // spelling is gated on `STRICT_UNDERLINE` instead of loosening the shared one.
        if (next?.type !== "thematicBreak" && next?.type !== "list") continue;
        if (nextStart === undefined || nextEnd === undefined) continue;
        if (
          next.type === "list" &&
          !STRICT_UNDERLINE.test(source.slice(nextStart, nextEnd))
        ) {
          continue;
        }
        // Exactly one newline. `trim()` accepted a blank line, so `[^1]:` / blank /
        // `---` became one heading spanning both -- where Obsidian reports the
        // definition and the thematic break as the separate blocks they are. A blank
        // line ends a definition, which is the same boundary
        // `comment-definition-extent.ts` and `definitionLazyTransform` both use.
        if (source.slice(end, nextStart) !== "\n") continue;
        if (!UNDERLINE.test(source.slice(nextStart, nextEnd))) continue;

        end = nextEnd;
        absorbed = 1;
        lines = source.slice(start, end).split("\n");
        underlineAt = lines.length - 1;
      }

      const marker = UNDERLINE.exec(lines[underlineAt]!)![1]!;
      const content = lines
        .slice(0, underlineAt)
        .map((line) => line.replace(QUOTE_PREFIX, ""))
        .join("\n");

      // The bare-reference pass reads a label's written form out of the source
      // through its host's span, so a `[^1]` inside this heading is placeable
      // only if the text carrying it is. The span ends before the underline,
      // the one line the heading's text does not include.
      const contentEnd = start + lines.slice(0, underlineAt).join("\n").length;
      const headEnd = start + lines.slice(0, underlineAt + 1).join("\n").length;
      const trailing = rebuild(source, headEnd, end, reparse);
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
        const absorbedEnd =
          parent.children[index + absorbed]?.position?.end ??
          definition.position.end;
        heading.position = {
          start: { ...definition.position.start },
          end:
            trailing.length > 0
              ? {
                  line: definition.position.start.line + underlineAt,
                  column: (lines[underlineAt]?.length ?? 0) + 1,
                  offset: headEnd,
                }
              : { ...absorbedEnd },
        };
      }

      parent.children.splice(index, 1 + absorbed, heading, ...trailing);
      index += trailing.length;
    }
  });
}
