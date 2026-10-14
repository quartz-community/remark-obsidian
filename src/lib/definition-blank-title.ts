import type { Definition, Root } from "mdast";

/** The three title delimiters CommonMark allows, with their closers. */
const CLOSERS: Readonly<Record<string, string>> = {
  "'": "'",
  '"': '"',
  "(": ")",
};

/**
 * A link reference definition's TITLE may start after a blank line.
 *
 * Their D6, measured against live 1.14.4 across nine shapes. Stock micromark ends a definition
 * at the blank line and reads the title as its own paragraph, so a reference inside it stays
 * live; Obsidian reads the title as part of the definition and the reference is dead:
 *
 *     [foo]: /url / blank / 'tit [^1] / le'     definition@0-3, ref DEAD
 *     [foo]: /url / blank / "title[^1]"         definition@0-2
 *     [foo]: /url / blank / (title[^1])         definition@0-2
 *     [foo]: /url / blank / blank / 'title'     definition@0-3, two blanks are fine
 *
 * THE TITLE TEXT IS KEPT, not merely swallowed. Dropping the paragraph without setting `title`
 * would make `remark-stringify` write `[foo]: /url` alone and delete the author's title on the
 * first format pass -- the standard this repo already refuses a parity fix for, twice.
 *
 * WHAT IT DELIBERATELY DOES NOT DO, both measured and both left to the golden:
 *
 *   An UNCLOSED title destroys the whole definition. `[foo]: /url` / blank / `'unclosed[^1]`
 *   reports NO reference link at all and two paragraphs -- the definition itself is gone. That
 *   is a demotion rather than an extension, and getting it wrong deletes a definition the
 *   author wrote, so it is recorded rather than attempted.
 *
 *   An `<...>` destination also runs across blank lines, giving `referenceLinks` the value
 *   `"a\n\nb\nc"` where we read `<a`. That rewrites the destination rather than extending the
 *   span, and 111 corpus answers depend on that field.
 *
 * SCOPING, because the corpus cannot adjudicate this. ZERO of its 3,403 cases hold a
 * definition followed by a blank line and a title delimiter, so a clean delta here proves
 * nothing about correctness -- it only proves the 124 definition cases and 111
 * `referenceLinks` answers are undisturbed, which is why every condition below is required
 * rather than inferred. The two controls that must not move are a plain paragraph after the
 * blank, and a definition that already carries a title.
 */
export function definitionBlankTitleTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;

  const children = tree.children;
  for (let index = children.length - 2; index >= 0; index--) {
    const definition = children[index];
    const next = children[index + 1];
    if (definition?.type !== "definition" || next?.type !== "paragraph")
      continue;
    // A definition that already has a title takes no second one: `[foo]: /url "done"` over
    // `'another'` leaves the paragraph alone, measured.
    if (definition.title != null) continue;

    const to = definition.position?.end?.offset;
    const from = next.position?.start?.offset;
    const end = next.position?.end?.offset;
    if (to === undefined || from === undefined || end === undefined) continue;
    // Blank lines only in the gap, any number of them. Anything else and the paragraph is its
    // own block.
    if (!/^\n[ \t\n]*$/u.test(source.slice(to, from))) continue;

    const body = source.slice(from, end);
    const opener = body[0];
    const closer = opener === undefined ? undefined : CLOSERS[opener];
    if (closer === undefined) continue;
    // The title has to CLOSE. An unclosed one destroys the definition in Obsidian, which this
    // pass does not reproduce, so it must not half-reproduce it either by swallowing the text.
    if (!body.endsWith(closer) || body.length < 2) continue;
    if (body.slice(1, -1).includes(closer)) continue;

    definition.title = body.slice(1, -1);
    if (definition.position) {
      definition.position.end = { ...next.position!.end };
    }
    children.splice(index + 1, 1);
  }
}
