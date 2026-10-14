import type { Root, RootContent } from "mdast";

import { endPoint } from "./comment-hoist.js";

/**
 * A CALLOUT only, which is the half Obsidian keeps a definition for.
 *
 * Measured against live 1.14.4, and the asymmetry is the whole scoping:
 *
 *     > [!note] title / [^1]: def / ⟨4sp⟩code   defs 1@1:0-1   the definition SURVIVES
 *     > quote         / [^1]: def / ⟨4sp⟩code   defs []        and here it does not
 *     - item          / [^1]: def / ⟨4sp⟩code   defs []        nor here
 *
 * So a quote or a list needs the definition FLATTENED as well as its tail split off, which
 * is what they already do -- the lazy paragraph swallows the label and reports a reference
 * instead. Splitting there made a `footnoteDefinition` node survive the absorption and
 * `bullet`/`ordered > footnote > indented` regressed from agreeing to reporting a definition
 * and a reference Obsidian has neither of. Compose went 13 to 14 before this scoping, which
 * is the gate catching a rule applied one container type too wide.
 */
const CONTAINERS = new Set(["callout"]);

/**
 * A definition a container absorbs LAZILY keeps only its own line.
 *
 * `micromark` reads `[^1]: def` and an indented line under it as ONE definition, which is
 * right at root and wrong directly below a container: `remark-parse` + `remark-gfm` give
 * `footnoteDefinition@1-2` for `> quote` / `[^1]: def` / `    code` before any pass here
 * runs, and the container then absorbs both lines. Obsidian ends the definition at its own
 * line and starts a new ROOT block on the next one:
 *
 *     > quote         / [^1]: def / ⟨4sp⟩code   blockquote@0, code@2       defs []
 *     > [!note] title / [^1]: def / ⟨4sp⟩code   callout@0,    code@2       defs 1@1:0-1
 *     - item          / [^1]: def / ⟨4sp⟩code   list@0 -- absorbed         defs []
 *     - item          / [^1]: def / %%          list@0,       comment@2    defs []
 *     [^1]: def       / ⟨4sp⟩more               footnoteDefinition@0-1     defs 1@0:0-1
 *
 * THIS PASS ONLY SPLITS. It deliberately does not decide what happens to the tail, because
 * `containerLazyTransform`'s guard chain already knows: a list absorbs indented code and a
 * quote does not, a comment is absorbed by nothing. That chain agrees with Obsidian on all
 * 80 cells of `compose.mts --matrix`, and the only reason these rows diverged is that the
 * continuation was inside the definition where no guard could see it. Splitting hands each
 * tail to the rule that already governs it -- rows three and four above differ in outcome
 * with no extra condition here.
 *
 * The LAST line above is why the prefix test matters. A root definition's indented
 * continuation is its own content, which 42 corpus cases depend on, so this fires only
 * where a container precedes the definition with no blank line between them.
 *
 * Scored before it was built, and the first scoping was refuted. Truncating every
 * definition INSIDE a container costs 495 documents against 102 -- `> [!note]` /
 * `> [^a$]: est` / `>   more` is PREFIXED, so it is genuine container content with a real
 * multi-line body. Requiring the bracket at column 0 is what separates lazy continuation
 * from containment, and that scoping scores 22 better against 9 worse on the referee. The
 * eight `compose.mts` rows it closes are invisible to that oracle, which compares only
 * definitions and references.
 */
export function definitionLazySplitTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  const children = tree.children;
  for (let index = children.length - 1; index >= 1; index--) {
    const definition = children[index];
    const previous = children[index - 1];
    if (definition?.type !== "footnoteDefinition") continue;
    if (!previous || !CONTAINERS.has(previous.type)) continue;

    // A callout holding ONLY its title. With a body line the definition does not survive at
    // all -- three referee documents say so, each a callout with prose before the label:
    //
    //   > [!note] / > Text %% [^ä] %% / [^1]: def / ⟨4sp⟩%%     answer has no `1`
    //   > [!tip]  / > Prose here...   / [^1]: ...               answer has no `1`
    //
    // against the title-only control where Obsidian reports `1@1:0-1`. Splitting in the
    // body case produced a definition it has none of, and the `--ids` diff is what named
    // them: the net figure moved by two while three documents were lost and one gained.
    // NOTE FOR WIDENING THIS. The test is callout-shaped, so it rejects every `list`
    // outright -- a list's child is a `listItem`, never a `calloutTitle`. Adding `"list"` to
    // the set above therefore measures NOTHING: the trees come back byte-identical and that
    // reads exactly like "the list case needs no change". It was dumped rather than inferred,
    // which is the only reason this is written down.
    //
    // So the list and quote halves are UNTESTED, not refuted. What IS measured is that
    // splitting for them without flattening regresses -- `bullet` and
    // `ordered > footnote > indented` went from agreeing to reporting a definition and a
    // reference Obsidian has neither of. At parse time the root sibling is there under both
    // list readings (`legacyLists` either way gives `list@0-0` then
    // `footnoteDefinition@1-2`), so the work is in how `containerLazyTransform` and
    // `footnoteInterruptTransform` then interact, not in finding the node.
    const body = previous as { children?: RootContent[] };
    if ((body.children ?? []).some((child) => child.type !== "calloutTitle")) {
      continue;
    }

    const from = definition.position?.start?.offset;
    const to = definition.position?.end?.offset;
    const previousEnd = previous.position?.end?.offset;
    if (from === undefined || to === undefined || previousEnd === undefined) {
      continue;
    }
    // Adjacent: ONE line ending and nothing else, which is what makes the definition lazy
    // continuation of the container rather than a block of its own.
    //
    // Written as an exact match because `.trim() !== ""` does NOT express it -- a blank line
    // trims to the empty string too, so `> quote` / blank / `[^1]: def` / `⟨4sp⟩more` passed
    // the guard and had its continuation split off, where Obsidian reports an ordinary
    // two-line definition. The control for that case is what caught it.
    if (!/^\n[ \t]*$/u.test(source.slice(previousEnd, from))) continue;

    // Column zero, unprefixed. This is the whole discriminator between a definition the
    // container absorbed lazily and one written inside it.
    const bol = source.lastIndexOf("\n", from - 1) + 1;
    if (bol !== from) continue;

    const firstBreak = source.indexOf("\n", from);
    if (firstBreak === -1 || firstBreak >= to) continue;

    // Re-parsed rather than span-edited, on both halves. Truncating the definition by hand
    // would mean shrinking it AND its paragraph AND that paragraph's children, which is the
    // descent-is-the-unit-of-work trap three passes here already fell into -- a node left
    // spanning the departed line. Re-parsing each half gives every node a correct span by
    // construction.
    const head = reparse(source.slice(from, firstBreak)).children[0];
    if (head?.type !== "footnoteDefinition") continue;
    const tail = reparse(source.slice(firstBreak + 1, to)).children;
    if (tail.length === 0) continue;

    shiftOnto(head, from);
    for (const node of tail) shiftOnto(node, firstBreak + 1);
    children.splice(index, 1, head, ...(tail as RootContent[]));

    // An UNCLOSED `%%` tail runs to the end of the note, which the fragment re-parse cannot
    // know: it saw a two-character document and bounded the comment there. Obsidian reports
    // `> [!note] title` / `[^1]: def` / `%%` as TWO sections, the callout and a comment that
    // swallows the trailing paragraph, where a line-bounded comment leaves three.
    //
    // Every comment pass runs at the top of the chain, hundreds of lines before this one, so
    // a comment created here never meets the pass that would extend it -- the same coupling
    // `liftContainerComment` records, and this is its idiom: take the end of the note, drop
    // the swallowed siblings, and let `commentParseTransform` re-derive the body as children
    // from the span. That is what keeps a reference inside the comment indexable.
    const last = tail[tail.length - 1];
    const opener = last?.position?.start?.offset;
    if (
      last?.type === "comment" &&
      opener !== undefined &&
      !source.slice(opener + 2).includes("%%")
    ) {
      last.position!.end = endPoint(source);
      delete (last as { children?: unknown }).children;
      children.splice(index + tail.length + 1);
    }
  }
}

/** Place a re-parsed fragment's nodes onto the document, offsets only. */
function shiftOnto(node: unknown, offset: number): void {
  const candidate = node as {
    position?: { start: { offset?: number }; end: { offset?: number } };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.offset = offset + (point.offset ?? 0);
    }
  }
  for (const child of candidate.children ?? []) shiftOnto(child, offset);
}
