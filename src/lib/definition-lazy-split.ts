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
const SPLITTABLE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["footnoteDefinition", new Set(["callout", "list", "blockquote"])],
  ["html", new Set(["list"])],
]);

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
 * TWO SPACER TYPES, one rule -- the fifth instance of that shape here, after `splitLazyHtml`
 * beside `splitLazyHeading` and the setext underline arriving as paragraph text or as a
 * thematic break. An html block runs to a blank line, so micromark hands `<div>` and a `%%`
 * under it over as ONE html node exactly as it spans a definition over its continuation:
 *
 *     - item / <div> / %%    obs  list@0, comment@2
 *                            was  list@0 swallowing `html@1-2`
 *
 * `SPLITTABLE` therefore maps a spacer type to the hosts it may be split after, and the two
 * entries are deliberately asymmetric: a definition is split after a callout, a list OR a
 * quote, an html block only after a LIST. A quote absorbs no html at all, so its `%%`
 * already stays at root and there is nothing to split.
 *
 * WHAT THE DEFINITION HALF NEEDED BESIDE THIS. Splitting leaves the head definition inside
 * the container, and Obsidian reports `defs []` for a list and a quote -- the label is folded
 * into the lazy paragraph as a reference. `footnoteInterruptTransform` does exactly that fold
 * and was DECLINING, because it tested adjacency with line numbers and this pass moves nodes
 * by offset, leaving every line at 1. Reading the gap from offsets instead is what let the
 * list and quote halves work at all; the two fixes are useless apart and were measured
 * together.
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
    const spacer = children[index];
    const previous = children[index - 1];
    const hosts = spacer ? SPLITTABLE.get(spacer.type) : undefined;
    if (!spacer || !hosts || !previous || !hosts.has(previous.type)) continue;

    // A callout holding ONLY its title. With a body line the definition does not survive at
    // all -- three referee documents say so, each a callout with prose before the label:
    //
    //   > [!note] / > Text %% [^ä] %% / [^1]: def / ⟨4sp⟩%%     answer has no `1`
    //   > [!tip]  / > Prose here...   / [^1]: ...               answer has no `1`
    //
    // against the title-only control where Obsidian reports `1@1:0-1`. Splitting in the
    // body case produced a definition it has none of, and the `--ids` diff is what named
    // them: the net figure moved by two while three documents were lost and one gained.
    // CALLOUT ONLY, because the test is callout-shaped: a list's child is a `listItem`,
    // never a `calloutTitle`. Running it unconditionally rejected every list outright and
    // made widening `SPLITTABLE` measure NOTHING -- the trees came back byte-identical,
    // which reads exactly like "the list case needs no change", and dumping them rather
    // than trusting that is the only reason it was caught.
    //
    // The body test is a CALLOUT rule, not a general one. Three referee documents put prose
    // before the label and Obsidian reports no definition for any of them, against the
    // title-only control where it reports `1@1:0-1`. A list and a quote have no such
    // distinction because they do not keep the definition at all -- `footnoteInterrupt`
    // folds it into their lazy paragraph, which is exactly what Obsidian's `defs []` says.
    if (previous.type === "callout") {
      const body = previous as { children?: RootContent[] };
      if (
        (body.children ?? []).some((child) => child.type !== "calloutTitle")
      ) {
        continue;
      }
    }

    const from = spacer.position?.start?.offset;
    const to = spacer.position?.end?.offset;
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
    // The SAME node type back, or the split changed what the first line is. `<div>` alone is
    // still `html` and `[^1]: def` alone is still a definition, so a different type means the
    // fragment did not stand on its own and the spacer is left whole.
    if (head?.type !== spacer.type) continue;
    const tail = reparse(source.slice(firstBreak + 1, to)).children;
    if (tail.length === 0) continue;

    // SPLIT ONLY WHERE THE TAIL BECOMES A ROOT BLOCK. If the host absorbs that type anyway
    // the split gains nothing and costs the tail its document-level extent, because the
    // fragment re-parse cannot see past its own slice.
    //
    // A LIST absorbs every member of the measured asymmetry class -- setext, indented, math
    // and html -- so for a list only a `comment` is left at root, a comment being absorbed by
    // nothing. Splitting a list's html spacer regardless closed `bullet` and
    // `ordered > html > comment` and broke `bullet` and `ordered > html > math` in the same
    // run: an even trade at 11, which is the absorption map stating a condition this pass had
    // not asked it for.
    if (previous.type === "list" && tail[0]?.type !== "comment") continue;

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
