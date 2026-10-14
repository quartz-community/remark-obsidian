import type { Heading, Paragraph, Root, RootContent, Text } from "mdast";

/** A setext underline alone on its line. */
const UNDERLINE = /^(=+|-+)[ \t]*$/u;

/**
 * A setext underline directly under a definition heads the definition's own line.
 *
 * `[foo]: /url` over `===` is an `<h1>` reading `[foo]: /url` to Obsidian, and **no
 * definition is created** -- the `[foo]` below it renders as literal text. micromark
 * consumes the definition first, so the `===` is left with nothing above it to
 * underline and becomes paragraph content instead.
 *
 * The arbiter settles it and agrees with the goldens: `remark-parse@8` gives
 * `heading | paragraph` for that input and `definition | heading | paragraph` once a
 * line sits between, which is the same split Obsidian reports. So the rule turns on
 * adjacency, and `commonmark/link-reference-definitions/215` -- the version with an
 * intervening `bar` -- already matches and stays matching.
 *
 * Thin corpus evidence, stated plainly: exactly one recorded case puts a definition
 * directly above an underline, so the corpus cannot adjudicate the general form and the
 * arbiter is what carries it. This case was also described in two places as
 * "contradiction-blocked", which it never was -- the detector had been collapsing
 * adjacent word runs across line endings, so the two inputs reduced to one shape.
 *
 * The heading's content is the definition's source slice as a single text node rather
 * than a re-parse, because re-parsing `[foo]: /url` on its own simply builds the
 * definition again. Nothing in it can form an inline construct anyway once the
 * definition is gone: `[foo]` has nothing to resolve against.
 */
export function definitionSetextTransform(tree: Root, source: string): void {
  if (source === "") return;

  const children = tree.children;
  for (let index = children.length - 2; index >= 0; index--) {
    const definition = children[index];
    const next = children[index + 1];
    if (definition?.type !== "definition") continue;
    // EITHER node type the underline can arrive as, which is the whole of this change.
    // `===` has no second reading so micromark leaves it as paragraph text, and that half
    // already worked; `---` is also a thematic break, so micromark builds one and the
    // paragraph-only gate declined the very case the rule was written for:
    //
    //     [ref]: /url / ===   heading@0-1 (h1)   we already matched
    //     [ref]: /url / ---   heading@0-1 (h2)   we gave definition + thematicBreak
    //
    // Both report NO referenceLink in Obsidian, so the definition really is consumed either
    // way. One rule needing a second node type, the fourth instance in this session.
    if (next?.type !== "paragraph" && next?.type !== "thematicBreak") continue;

    let line: string;
    if (next.type === "paragraph") {
      const first = next.children[0];
      if (first?.type !== "text") continue;
      line = first.value.split("\n")[0] ?? "";
    } else {
      // A thematic break carries no children, so its own source slice is the underline.
      const breakFrom = next.position?.start?.offset;
      const breakTo = next.position?.end?.offset;
      if (breakFrom === undefined || breakTo === undefined) continue;
      line = source.slice(breakFrom, breakTo).split("\n")[0] ?? "";
    }
    const marker = UNDERLINE.exec(line);
    if (!marker) continue;

    const from = definition.position?.start?.offset;
    const gapTo = next.position?.start?.offset;
    if (from === undefined || gapTo === undefined) continue;
    // Directly under it, which is the whole rule: one line ending and nothing else.
    const defEnd = definition.position?.end?.offset;
    if (defEnd === undefined || source.slice(defEnd, gapTo) !== "\n") continue;

    const heading: Heading = {
      type: "heading",
      depth: marker[1]?.startsWith("=") === true ? 1 : 2,
      children: [
        {
          type: "text",
          value: source.slice(from, defEnd),
          position: {
            start: { ...definition.position!.start },
            end: { ...definition.position!.end },
          },
        } as Text,
      ],
      position: {
        start: { ...definition.position!.start },
        // The end of the underline, computed from the source rather than taken from
        // the text node, whose span runs on through the line ending. `headingName`
        // strips the underline with a `$`-anchored pattern, so one extra newline
        // makes it miss -- and the definition-line shift below it then names the
        // heading `===`.
        end: {
          ...definition.position!.end,
          offset: defEnd + 1 + line.length,
          line: definition.position!.end.line + 1,
          column: line.length + 1,
        },
      },
    };

    // Whatever followed the underline stays a paragraph of its own. The underline's
    // text node and the break after it go; everything else keeps its own position.
    // Only the paragraph shape can carry anything past the underline. A thematic break is
    // the whole line by construction, so there is no tail to preserve.
    const rest = (
      next.type === "paragraph"
        ? next.children.slice(next.children[1]?.type === "break" ? 2 : 1)
        : []
    ) as RootContent[];
    const replacement: RootContent[] = [heading];
    if (rest.length > 0) {
      replacement.push({
        type: "paragraph",
        children: rest as Paragraph["children"],
        position: {
          start: { ...(rest[0]!.position?.start ?? next.position!.start) },
          end: { ...next.position!.end },
        },
      });
    }
    children.splice(index, 2, ...replacement);
  }
}
