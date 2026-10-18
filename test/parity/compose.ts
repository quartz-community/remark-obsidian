/**
 * The composition sweeps' LIBRARY half: construct tables, per-axis case generation, both
 * sides' projections, and the comparison.
 *
 * Split out of `compose.mts` so `compose.test.ts` can import it. The CLI selects an axis from
 * `process.argv` at module scope, which a test cannot drive, and `evaluate`/`askBatch` need a
 * running Obsidian, which CI does not have. Everything here is pure: given a stored answer
 * and a markdown string it decides agreement without touching the app.
 *
 * That split is what makes the axes GATEABLE. The main parity gate is authoritative despite
 * needing Obsidian because the app's answers are COMMITTED and our side is recomputed in CI;
 * the composition axes had no committed expectation at all, so a regression in the dimension
 * that produced nearly every recent fix was silent. `goldens/compose.json` closes that, and
 * this file is the part both the recorder and the gate share.
 */
import { applyTextTransform, parseOurs } from "./chain.js";
import { computeOurs, projectOurs } from "./normalize.js";

/** One line of block syntax each, chosen so every pair is a legal document. */
export const BLOCKS: ReadonlyArray<readonly [string, string]> = [
  ["bullet", "- item"],
  ["ordered", "1. item"],
  ["quote", "> quote"],
  ["callout", "> [!note] title"],
  ["heading", "# heading"],
  ["setext", "title\n==="],
  ["indented", "    code"],
  ["fence", "```"],
  ["comment", "%%"],
  ["thematic", "---"],
  ["table", "| a | b |\n| --- | --- |"],
  ["math", "$$"],
  ["footnote", "[^1]: def"],
  ["linkdef", "[ref]: /url"],
  ["html", "<div>"],
  ["paragraph", "text"],
];

/** `delete` and `inlineCode` text from our tree, for the two projections `Projections` lacks. */
function inlineFromTree(markdown: string): {
  strike: string[];
  code: string[];
} {
  const tree = parseOurs(applyTextTransform(markdown), "all-features");
  const strike: string[] = [];
  const code: string[] = [];
  const textOf = (node: unknown): string => {
    const n = node as { value?: unknown; children?: unknown[] };
    if (typeof n.value === "string") return n.value;
    return (n.children ?? []).map(textOf).join("");
  };
  const walk = (node: unknown): void => {
    const n = node as { type: string; children?: unknown[] };
    // The two regions the REAL projections exclude, and this walker must exclude the same
    // ones or it is a different oracle. Both were found the hard way: the first version
    // walked everything and reported four divergences that were all its own fault --
    // `%% ~~del~~` and `` %% `c` `` came back with content, and so did `[^1]: def ~~del~~`.
    //
    //   `comment`            renders nothing, so nothing inside one reaches a projection.
    //   `footnoteDefinition` is RELOCATED by the renderer into a trailing `.footnotes`
    //                        block, which `oracle.e2e.ts` removes from the clone before
    //                        reading -- so a construct inside a definition is not in
    //                        Obsidian's capture at all.
    //
    // `highlights` and `emphasis` already honoured both, which is why only the two
    // hand-rolled lists diverged -- the tell that the sweep tool was wrong rather than the
    // package. That is the fourth time a new oracle's first findings have been bugs in the
    // oracle here.
    if (n.type === "comment" || n.type === "footnoteDefinition") return;
    if (n.type === "delete") strike.push(textOf(n));
    if (n.type === "inlineCode") code.push(textOf(n));
    for (const child of n.children ?? []) walk(child);
  };
  walk(tree);
  return { strike, code };
}

interface Point {
  readonly line: number;
  readonly col: number;
}
interface Span {
  readonly start: Point;
  readonly end: Point;
}
interface Reference {
  readonly original: string;
  readonly link: string;
  readonly displayText: string;
  readonly position: Span;
}

/** Exactly `oracle.e2e.ts`'s spelling, so the two sides are comparable. */
const at = (point: Point | undefined): string =>
  `${point?.line ?? 0}:${point?.col ?? 0}`;
const span = (position: Span | undefined): string =>
  `${at(position?.start)}-${at(position?.end)}`;
const reference = (entry: Reference): string =>
  `${entry.original}=>${entry.link}|${entry.displayText}@${span(entry.position)}`;

export interface Facts {
  readonly defs: readonly string[];
  readonly sections: readonly string[];
  // Compared as well as `sections`, because a container can swallow a construct without
  // moving any root section: `normalize.ts` records that Obsidian RENDERS a heading inside a
  // container and does not INDEX it, so our projection drops one our tree keeps, and only a
  // second oracle can tell "both report none" from "neither was asked". These notes carry
  // five instances of a family read as clean because one projection was never compared.
  readonly headings: readonly string[];
  /**
   * The inline-visible cache keys, formatted exactly as `oracle.e2e.ts` formats them.
   *
   * Added for the inline axes and compared on EVERY axis, because a block sweep that ignores
   * links and tags cannot see a container eating a wikilink -- the same reason `headings` was
   * wired in, which found nothing and was still worth running. Matching the recorder's
   * spelling character for character is the part that matters: formatting `headings` as
   * `level:name` instead of `level:name@line:col` reported 52 divergences that did not exist.
   */
  readonly links: readonly string[];
  readonly embeds: readonly string[];
  readonly tags: readonly string[];
  readonly refs: readonly string[];
  readonly blocks: readonly string[];
  /**
   * The DOM half, present only on the inline axes.
   *
   * Eight of the fourteen inline constructs report nothing to `metadataCache`, so the cache
   * keys above cannot adjudicate them at all -- they were swept as wrappers only. These come
   * from `ask-dom.ts`, validated against the committed goldens at 663 of 663.
   *
   * `strike` and `code` are derived from OUR TREE here rather than added to `Projections`,
   * because widening `PROJECTION_KEYS` changes what the main gate compares and would force a
   * re-recording. A sweep tool may read the tree directly; the gate may not grow a key
   * without a golden behind it.
   */
  readonly dom?: {
    readonly highlights: readonly string[];
    readonly emphasis: readonly string[];
    readonly strike: readonly string[];
    readonly code: readonly string[];
    readonly mathDisplay: readonly boolean[];
  };
}

export function theirs(answer: unknown): Facts {
  const compute = (answer ?? {}) as {
    footnotes?: Array<{
      id: string;
      position: { start: { line: number; col: number }; end: { line: number } };
    }>;
    sections?: Array<{ type: string; position: { start: { line: number } } }>;
    headings?: Array<{
      heading: string;
      level: number;
      position: { start: { line: number; col: number } };
    }>;
    links?: Reference[];
    embeds?: Reference[];
    tags?: Array<{ tag: string; position: Span }>;
    footnoteRefs?: Array<{ id: string; position: Span }>;
    blocks?: Record<string, { id: string; position: Span }>;
  };
  return {
    defs: (compute.footnotes ?? []).map(
      (f) =>
        `${f.id}@${f.position.start.line}:${f.position.start.col}-${f.position.end.line}`,
    ),
    sections: (compute.sections ?? [])
      .map((s) => `${s.type}@${s.position.start.line}`)
      .filter((s) => !/^(?:text|element)@/u.test(s)),
    // `level:name@line:col`, which is what `normalize.ts` builds for the compute oracle.
    // Dropping the position reported 52 divergences that were purely the two sides being
    // formatted differently -- the goldmark `tasks` trap inverted, where a mismatched
    // projection reads as total disagreement rather than as agreement.
    headings: (compute.headings ?? []).map(
      (h) =>
        `${h.level}:${h.heading}@${h.position.start.line}:${h.position.start.col}`,
    ),
    links: (compute.links ?? []).map(reference),
    embeds: (compute.embeds ?? []).map(reference),
    tags: (compute.tags ?? []).map((t) => `${t.tag}@${span(t.position)}`),
    refs: (compute.footnoteRefs ?? []).map(
      (f) => `${f.id}@${at(f.position.start)}`,
    ),
    blocks: Object.values(compute.blocks ?? {}).map(
      (b) => `${b.id}@${span(b.position)}`,
    ),
  };
}

export function ours(text: string): Facts {
  const source = applyTextTransform(text);
  const computed = computeOurs(parseOurs(source, "all-features"), source) as {
    footnotes?: readonly string[];
    sections?: readonly string[];
    headings?: readonly string[];
    links?: readonly string[];
    embeds?: readonly string[];
    tags?: readonly string[];
    footnoteRefs?: readonly string[];
    blocks?: readonly string[];
  };
  return {
    defs: (computed.footnotes ?? []).map((entry) =>
      entry.replace(/-(\d+):\d+$/u, "-$1"),
    ),
    sections: (computed.sections ?? [])
      .map((entry) => {
        const [type, rest] = entry.split("@");
        return `${type}@${(rest ?? "").split(":")[0]}`;
      })
      .filter((entry) => !/^(?:text|element)@/u.test(entry)),
    headings: computed.headings ?? [],
    links: computed.links ?? [],
    embeds: computed.embeds ?? [],
    tags: computed.tags ?? [],
    refs: computed.footnoteRefs ?? [],
    blocks: computed.blocks ?? [],
  };
}

/** Our side of the DOM half, from the main-gate projections plus two tree-derived lists. */
export function oursDom(markdown: string): NonNullable<Facts["dom"]> {
  const projected = projectOurs(markdown, "all-features");
  const { strike, code } = inlineFromTree(markdown);
  return {
    highlights: projected.highlights,
    emphasis: projected.emphasis,
    strike,
    code,
    mathDisplay: projected.math.map((entry) => entry.display),
  };
}

/**
 * The discriminating experiment, rather than the full cross-product.
 *
 * Every diverging pair is `container > absorbable`, and the containers contribute nothing of
 * their own: the absorbables are `comment`, `math`, indented code and `thematic`. Seven
 * constructs -- heading, setext, fence, table, footnote, html, paragraph -- appear in ZERO
 * diverging pairs across all 32 of their compositions, so they are safe to use as a SPACER.
 *
 * Putting a known-good construct between a container and an absorbable asks the one question
 * the pairs cannot: does the interaction need ADJACENCY, or does it reach across a block? An
 * adjacency rule stops diverging once something clean sits between; a container-state rule
 * keeps diverging. That is the same ambiguity that cost four attempts on the comment fold.
 *
 * 5 containers x 7 spacers x 4 absorbables is 140 sequences, against 4,096 for the full
 * triple cross-product, and it answers the question the full sweep would bury.

 */
const CONTAINERS = ["bullet", "ordered", "quote", "callout", "linkdef"];
const SPACERS = [
  "heading",
  "setext",
  "fence",
  "table",
  "footnote",
  "html",
  "paragraph",
];
const ABSORBABLES = ["comment", "math", "indented", "thematic"];

/**
 * `--matrix` reports the RULE in every container/follower cell, not just the divergences.
 *
 * The pair and isolate sweeps answer "where are we wrong", which is what a backlog needs and
 * not what a MAP needs. "A list absorbs an unclosed `$$` and a quote does not" is the useful
 * unit, and the only reason it is known is that one cell was chased by hand -- the sweeps
 * print a divergence either way and never state what Obsidian actually did.
 *
 * So this derives one bit per cell from `sections`, for BOTH sides: does the follower appear
 * as its own ROOT section, or has the container swallowed it? `sections` is root-level, so a
 * follower starting on the container's next line is absorbed exactly when no section starts
 * at that line. Printing the cells we AGREE on matters as much as the others -- an agreeing
 * cell is a rule this package already encodes, which is evidence rather than absence, and it
 * is what makes a guard list auditable against the application instead of against a backlog.
 */
/**
 * The inner prefix each container gives its own content.
 *
 * A quote marker takes one following space, and a list item's content column is its marker
 * plus one -- which is why the bullet and ordered prefixes differ by a column. `linkdef` has
 * no inside at all, and the matrix above measures it absorbing nothing, so it is not a
 * container here either.
 */
/**
 * The inline constructs, and what each one is worth asking about.
 *
 * SIX of the fourteen are indexed by `metadataCache` and so adjudicable here -- wikilink,
 * embed, tag, inline footnote, footnote reference and block identifier. The other EIGHT are
 * invisible to it: `==hi== *em* **st** ~~del~~ $x$ \`c\`` reports nothing at all, measured
 * before this was built rather than discovered after.
 *
 * They are included anyway, as WRAPPERS, because that is where the interaction lives and the
 * cache can still see it: `==[[Note]]==` reports the wikilink at column 2, `*#tag*` reports
 * the tag, `~~[^1]~~` reports the reference. So this sweep answers "does an indexed construct
 * survive inside, or beside, each of the other thirteen" -- and does NOT answer anything
 * about highlight, emphasis, strong, strikethrough, math or code-span CONTENT, which needs
 * the DOM and therefore the recorder. `overview.ts` registers that blindness.
 */
const INLINE: ReadonlyArray<readonly [string, string]> = [
  ["wikilink", "[[Note]]"],
  ["embed", "![[Note]]"],
  ["tag", "#tag"],
  ["inlinefn", "^[body]"],
  ["footref", "[^1]"],
  ["blockid", "^blk"],
  ["highlight", "==hi=="],
  ["emphasis", "*em*"],
  ["strong", "**st**"],
  ["underscore", "_us_"],
  ["strike", "~~del~~"],
  ["imath", "$x$"],
  ["dmath", "$$y$$"],
  ["codespan", "`c`"],
];

const INNER: ReadonlyArray<readonly [string, string]> = [
  ["bullet", "  "],
  ["ordered", "   "],
  ["quote", "> "],
  ["callout", "> "],
];

/**
 * The follower indents `--lazy` sweeps, which is the axis's actual variable.
 *
 * `--inside` prefixes EVERY line of the inner block, so the whole grid is WELL-FORMED
 * nesting. The forms the corpus actually diverges on are PARTIALLY prefixed -- 31 of the 50
 * quote-bearing minimal forms from a live shrink, against 19 fully prefixed -- where the
 * container's body stops being marked and the next line continues it lazily. No cell of any
 * existing axis spells that, which is why `quoted-fence-lazy.ts` was found by shrinking the
 * corpus and never by a sweep.
 *
 * **The first version of this axis varied the wrong thing and measured zero.** It generated
 * the follower bare against the follower PREFIXED, on the reasoning that carrying the
 * container's marker is what separates lazy content from ordinary content. Obsidian's answer
 * is IDENTICAL in all 64 cells: after an open container a bare line is absorbed exactly as a
 * marked one is, so the pair tests nothing. That is a fifth family probed on an axis that
 * returns agreement, and it is recorded here rather than deleted because the zero it produced
 * is indistinguishable from a working sweep finding nothing.
 *
 * What the diverging forms actually vary is the follower's INDENT -- `⇥It %% [^x-y]` under a
 * quote, `⇥[^ch2*]:` under a list. Screened before building: across 32 container-block cells
 * at seven indents, Obsidian's own answer varies in **16**, so the threshold between lazy
 * continuation and indented code is a real boundary this grid can reach.
 *
 * `marked` is appended as the control -- the follower carrying the container's own prefix,
 * which is `--inside`'s shape and therefore the cell whose answer is already swept.
 */
const LAZY_INDENTS: ReadonlyArray<readonly [string, string]> = [
  ["bare", ""],
  ["1sp", " "],
  ["2sp", "  "],
  ["3sp", "   "],
  ["4sp", "    "],
  ["tab", "\t"],
  ["tab2sp", "\t  "],
];

/**
 * `--inside` maps the OTHER axis: what each block does INSIDE each container.
 *
 * `--matrix` maps adjacency -- a container, then a block at column 0 -- and that axis is now
 * four cells from clean. This is its complement, and the corpus samples it without ever
 * tabulating it: `CONTEXTS` in `corpus.ts` splices constructs into containers, but by
 * construct rather than as a complete table, so a cell nobody thought to sample is
 * indistinguishable from one that works.
 *
 * There is no absorption bit to derive here, because a block inside a quote is not a root
 * section at all -- so the comparison is the full `sections` and `defs` equality the pair
 * sweep uses, and the map is the set of cells that disagree.
 */
/**
 * Nested containers, as `[name, the opening lines, the inner content prefix]`.
 *
 * The prefix is the column the INNERMOST container gives its own content, which is what a
 * follower has to carry to be inside it: a quote marker and one space per level, a bullet's
 * marker plus one, and `- - item` reaching four -- exactly the indented-code threshold, which
 * is the collision this axis exists to test.
 *
 * Written out rather than composed from `INNER`, because the opening line is not the two
 * single-level heads concatenated: `> - item` is one line, not `> quote` then `- item`.
 */
const NESTED: ReadonlyArray<readonly [string, string, string]> = [
  ["quote > quote", "> > quote", "> > "],
  ["quote > bullet", "> - item", ">   "],
  ["bullet > quote", "- > quote", "  > "],
  ["bullet > bullet", "- - item", "    "],
  ["quote > callout", "> > [!note] title", "> > "],
  ["callout > quote", "> [!note] title\n> > quote", "> > "],
];

/**
 * `--nested` asks whether two levels of container change any rule one level established.
 *
 * `--inside` is clean at depth one over all 64 cells, which says nothing about depth two: the
 * corpus reaches nesting only incidentally, and `> > %%` is already known to have a rule of
 * its own -- a comment opened inside a quote needs its closer inside too, which is the F4
 * gap `commentQuoteExtentTransform` closed. A rule that holds at one level and breaks at two
 * is the shape every compositional defect here has had.
 */
/**
 * `--inline` sweeps every ordered pair of the 14 inline constructs, adjacent on one line.
 *
 * `--inline-block` puts each inline construct inside each of the 16 block constructs, which
 * is the other half: `# [[Note]]` and `> #tag` ask whether a BLOCK host swallows an indexed
 * inline construct, where `--inline` asks whether an inline WRAPPER does.
 *
 * Every document ends with a real definition for `[^1]`, because `footnoteRefs` lists only
 * references whose name HAS one -- a probe for reference behaviour that defines nothing
 * proves nothing, which these notes record costing a whole wave of eight cases.
 */
export const DEFINE = "\n\n[^1]: def\n";

/** Every axis, by the flag that selects it. `triples` is excluded: it is an exploration. */
export const AXES = [
  "pairs",
  "matrix",
  "inside",
  "isolate",
  "nested",
  "inline",
  "inline-block",
  "lazy",
] as const;
export type Axis = (typeof AXES)[number];

/** Whether an axis needs the DOM half, which only the inline ones can decide anything with. */
export const needsDom = (axis: Axis): boolean =>
  axis === "inline" || axis === "inline-block";

export interface Case {
  readonly name: string;
  readonly text: string;
  readonly followerLine?: number;
}

/**
 * The sequences for one axis.
 *
 * Transcribed from the CLI's generation blocks unchanged, so a recorded golden and a live
 * sweep enumerate the same documents in the same order -- if these drifted apart the golden
 * would silently describe different sequences than the ones being measured.
 */
export function casesFor(axis: Axis): Case[] {
  const cases: Case[] = [];
  const syntaxOf = new Map(BLOCKS);

  if (axis === "inline") {
    for (const [firstName, first] of INLINE) {
      for (const [secondName, second] of INLINE) {
        cases.push({
          name: `${firstName} + ${secondName}`,
          text: `${first}${second}${DEFINE}`,
        });
      }
    }
  }
  if (axis === "inline-block") {
    for (const [blockName] of BLOCKS) {
      const host = syntaxOf.get(blockName)!;
      for (const [inlineName, inlineSyntax] of INLINE) {
        const hostLines = host.split("\n");
        hostLines[hostLines.length - 1] =
          `${hostLines[hostLines.length - 1]} ${inlineSyntax}`;
        cases.push({
          name: `${blockName} [ ${inlineName} ]`,
          text: `${hostLines.join("\n")}${DEFINE}`,
        });
      }
    }
  }
  if (axis === "nested") {
    for (const [name, head, prefix] of NESTED) {
      for (const [innerName, innerSyntax] of BLOCKS) {
        const body = innerSyntax
          .split("\n")
          .map((line) => `${prefix}${line}`)
          .join("\n");
        cases.push({
          name: `${name} [ ${innerName} ]`,
          text: `${head}\n${body}\n\nuse[^1]\n`,
        });
        cases.push({
          name: `${name} > ${innerName}`,
          text: `${head}\n${innerSyntax}\n\nuse[^1]\n`,
        });
      }
    }
  }
  if (axis === "inside") {
    for (const [container, prefix] of INNER) {
      const head = syntaxOf.get(container)!;
      for (const [innerName, innerSyntax] of BLOCKS) {
        const body = innerSyntax
          .split("\n")
          .map((line) => `${prefix}${line}`)
          .join("\n");
        cases.push({
          name: `${container} [ ${innerName} ]`,
          text: `${head}\n${body}\n\nuse[^1]\n`,
        });
      }
    }
  }
  if (axis === "matrix") {
    for (const container of CONTAINERS) {
      const head = syntaxOf.get(container)!;
      for (const [followerName, follower] of BLOCKS) {
        cases.push({
          name: `${container} > ${followerName}`,
          text: `${head}\n${follower}\n\nuse[^1]\n`,
          followerLine: head.split("\n").length,
        });
      }
    }
  }
  if (axis === "isolate") {
    for (const container of CONTAINERS) {
      for (const spacer of SPACERS) {
        for (const absorbable of ABSORBABLES) {
          cases.push({
            name: `${container} > ${spacer} > ${absorbable}`,
            text:
              `${syntaxOf.get(container)!}\n${syntaxOf.get(spacer)!}\n` +
              `${syntaxOf.get(absorbable)!}\n\nuse[^1]\n`,
          });
        }
      }
    }
  }
  if (axis === "lazy") {
    for (const [container, prefix] of INNER) {
      const head = syntaxOf.get(container)!;
      for (const [innerName, innerSyntax] of BLOCKS) {
        const body = innerSyntax
          .split("\n")
          .map((line) => `${prefix}${line}`)
          .join("\n");
        for (const [indentName, indent] of LAZY_INDENTS) {
          cases.push({
            name: `${container} [ ${innerName} ] ${indentName}`,
            text: `${head}\n${body}\n${indent}lazy[^1]\n\nuse[^1]\n`,
          });
        }
        cases.push({
          name: `${container} [ ${innerName} ] marked`,
          text: `${head}\n${body}\n${prefix}lazy[^1]\n\nuse[^1]\n`,
        });
      }
    }
  }
  if (axis === "pairs") {
    for (const [firstName, first] of BLOCKS) {
      for (const [secondName, second] of BLOCKS) {
        cases.push({
          name: `${firstName} > ${secondName}`,
          text: `${first}\n${second}\n\nuse[^1]\n`,
        });
      }
    }
  }
  return cases;
}

/** One comparison, shared by the recorder and the gate so they cannot disagree. */
export function agrees(want: Facts, got: Facts): boolean {
  return (
    JSON.stringify(want.defs) === JSON.stringify(got.defs) &&
    JSON.stringify(want.sections) === JSON.stringify(got.sections) &&
    JSON.stringify(want.headings) === JSON.stringify(got.headings) &&
    JSON.stringify(want.links) === JSON.stringify(got.links) &&
    JSON.stringify(want.embeds) === JSON.stringify(got.embeds) &&
    JSON.stringify(want.tags) === JSON.stringify(got.tags) &&
    JSON.stringify(want.refs) === JSON.stringify(got.refs) &&
    JSON.stringify(want.blocks) === JSON.stringify(got.blocks) &&
    JSON.stringify(want.dom) === JSON.stringify(got.dom)
  );
}

/** Our whole side for one sequence, DOM half included where the axis needs it. */
export function oursFor(text: string, axis: Axis): Facts {
  return needsDom(axis) ? { ...ours(text), dom: oursDom(text) } : ours(text);
}
