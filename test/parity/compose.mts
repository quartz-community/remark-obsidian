/**
 * Sweep SEQUENCES of block constructs against a running Obsidian.
 *
 *     npx tsx --conditions=development test/parity/compose.mts [--triples]
 *
 * The corpus tests a construct in isolation, a construct inside a container, and what
 * follows an inline delimiter. It does not test one block construct FOLLOWED BY another, and
 * that is where this package's recent defects have lived without exception:
 *
 * - `- a` / `lazy` / `[^1]: def` parsed correctly while `list` / `code` / `definition` did
 *   not -- the same rule, broken by one intervening block, worth 43 referee documents.
 * - The comment fold needed three changes at once; any one or two measured as NO CHANGE.
 * - The math demotion looked like one defect with four symptoms and was three defects
 *   needing three separate fixes.
 * - The tab rule is correct in isolation and wrong in documents carrying six constructs.
 * - `pass-order.mts` reports 42 of 62 passes position-sensitive, which is the same fact
 *   stated about the pipeline rather than about the input.
 *
 * So the missing axis is composition, and it is cheap now: `ask.mts`'s cost is per CALL, not
 * per document -- thirty documents answer in 1.3 seconds -- so every ordered pair of a dozen
 * block constructs is one batch.
 *
 * Each case is `A` then `B` with NO blank line between them, which is the interesting case
 * because a blank line ends almost everything, followed by a blank line and `use[^1]` so the
 * footnote projections have something to report. Divergences are printed with both answers;
 * anything this finds is a lead to probe and then promote into `corpus.ts`, exactly like a
 * sweep finding.
 *
 * Obsidian must be running with a vault open. See `ask.mts` for the channel's four gotchas.
 */
import { execFileSync } from "node:child_process";

import { applyTextTransform, parseOurs } from "./chain.js";
import { askDom } from "./ask-dom.js";
import { projectOurs } from "./normalize.js";
import { computeOurs } from "./normalize.js";

/** One line of block syntax each, chosen so every pair is a legal document. */
const BLOCKS: ReadonlyArray<readonly [string, string]> = [
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

const LOG_LINE = /^\d{4}-\d{2}-\d{2} /u;

function evaluate(code: string): string {
  return execFileSync("obsidian", ["eval", `code=${code}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 180_000,
  })
    .split("\n")
    .filter((line) => !LOG_LINE.test(line) && line.trim() !== "")
    .map((line) => line.replace(/^=> /u, ""))
    .join("\n")
    .trim();
}

function askBatch(documents: readonly string[]): unknown[] {
  const encoded = JSON.stringify(
    documents.map((text) => Buffer.from(text, "utf8").toString("base64")),
  );
  evaluate(
    `window.__cmp='pending';(async()=>{const qs=${encoded};const out=[];` +
      `for(const q of qs){const b=Uint8Array.from(atob(q),c=>c.charCodeAt(0)).buffer;` +
      `out.push(await app.metadataCache.computeMetadataAsync(b))}` +
      `window.__cmp=JSON.stringify(out)})()`,
  );
  let raw = "pending";
  for (let attempt = 0; attempt < 80 && raw === "pending"; attempt++) {
    raw = evaluate("window.__cmp");
  }
  if (raw === "pending") throw new Error("Obsidian did not finish");
  return JSON.parse(raw) as unknown[];
}

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

interface Facts {
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

function theirs(answer: unknown): Facts {
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

function ours(text: string): Facts {
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
function oursDom(markdown: string): NonNullable<Facts["dom"]> {
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
const inlinePairs = process.argv.includes("--inline");
const inlineBlock = process.argv.includes("--inline-block");
const nested = process.argv.includes("--nested");
const inside = process.argv.includes("--inside");
const matrix = process.argv.includes("--matrix");
const isolate = process.argv.includes("--isolate");
const triples = process.argv.includes("--triples");
const cases: Array<{ name: string; text: string; followerLine?: number }> = [];
const syntaxOf = new Map(BLOCKS);
/**
 * `--all` runs every axis and prints one table, so progress is a single command.
 *
 * These axes have NO committed expectation -- they need a running Obsidian, so there is no
 * golden and nothing fails when a count worsens. That makes reproducibility the only thing
 * standing in for a gate, and a figure nobody re-runs becomes folklore. One command that
 * reports all seven is what makes "better numbers" a measurement rather than a memory.
 *
 * Spawned per axis rather than looped in process, because each mode is selected from
 * `process.argv` at module scope; re-entering would need the flags to become parameters and
 * every call site to change. A subprocess per axis costs seconds against sweeps that take
 * minutes.
 */
if (process.argv.includes("--all")) {
  const { spawnSync } = await import("node:child_process");
  const AXES: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["block > block (pairs)", []],
    ["container x follower", ["--matrix"]],
    ["block inside container", ["--inside"]],
    ["container > spacer > absorbable", ["--isolate"]],
    ["nested containers", ["--nested"]],
    ["inline x inline", ["--inline"]],
    ["inline x block", ["--inline-block"]],
  ];
  let total = 0;
  let swept = 0;
  const rows: string[] = [];
  for (const [name, flags] of AXES) {
    const run = spawnSync(
      "npx",
      ["tsx", "--conditions=development", "test/parity/compose.mts", ...flags],
      {
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "--conditions=development" },
      },
    );
    const found = /(\d+) of (\d+) diverge/u.exec(run.stdout ?? "");
    if (!found) {
      rows.push(`  ${name.padEnd(32)}FAILED TO RUN`);
      continue;
    }
    const diverge = Number(found[1]);
    const of = Number(found[2]);
    total += diverge;
    swept += of;
    rows.push(
      `  ${name.padEnd(32)}${String(diverge).padStart(4)} of ${String(of).padStart(5)}`,
    );
  }
  console.log("compose: every axis\n");
  for (const row of rows) console.log(row);
  console.log(
    `\n  ${"TOTAL".padEnd(32)}${String(total).padStart(4)} of ${String(swept).padStart(5)}`,
  );
  console.log(
    "\n  Lower is better. No axis has a committed expectation, so this number is" +
      "\n  reproducible rather than asserted -- re-run it, do not remember it.",
  );
  process.exit(0);
}

const DEFINE = "\n\n[^1]: def\n";
if (inlinePairs) {
  for (const [firstName, first] of INLINE) {
    for (const [secondName, second] of INLINE) {
      cases.push({
        name: `${firstName} + ${secondName}`,
        text: `${first}${second}${DEFINE}`,
      });
    }
  }
}
if (inlineBlock) {
  const syntax = new Map(BLOCKS);
  for (const [blockName] of BLOCKS) {
    const host = syntax.get(blockName)!;
    for (const [inlineName, inlineSyntax] of INLINE) {
      // Appended to the host's LAST line, so `| a | b |` / `| --- |` keeps its delimiter row
      // and a fence keeps its opener. A construct spliced into the middle of a two-line host
      // is a different question and not this one.
      const lines = host.split("\n");
      lines[lines.length - 1] = `${lines[lines.length - 1]} ${inlineSyntax}`;
      cases.push({
        name: `${blockName} [ ${inlineName} ]`,
        text: `${lines.join("\n")}${DEFINE}`,
      });
    }
  }
}
if (nested) {
  for (const [name, head, prefix] of NESTED) {
    for (const [innerName, innerSyntax] of BLOCKS) {
      const body = innerSyntax
        .split("\n")
        .map((line) => `${prefix}${line}`)
        .join("\n");
      // Both halves of the axis. `[ B ]` puts the follower INSIDE the innermost container,
      // which is `--inside` at depth two; `> B` puts it at column 0 AFTER the nesting, which
      // is `--matrix` at depth two. The absorption rules live on the second one, and every
      // divergence left in this whole space is an absorption or an extent, so testing only
      // the inside half would retire the cheaper question and leave the real one open.
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
if (inside) {
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
if (matrix) {
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
if (isolate) {
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
const skipPairs =
  isolate || matrix || inside || nested || inlinePairs || inlineBlock;
for (const [firstName, first] of skipPairs ? [] : BLOCKS) {
  for (const [secondName, second] of BLOCKS) {
    if (triples) {
      for (const [thirdName, third] of BLOCKS) {
        cases.push({
          name: `${firstName} > ${secondName} > ${thirdName}`,
          text: `${first}\n${second}\n${third}\n\nuse[^1]\n`,
        });
      }
    } else {
      cases.push({
        name: `${firstName} > ${secondName}`,
        text: `${first}\n${second}\n\nuse[^1]\n`,
      });
    }
  }
}

console.log(`compose: ${cases.length} sequences\n`);
const diverged: string[] = [];
const rules = new Map<string, { obs: boolean; us: boolean }>();

/**
 * Whether the container swallowed a follower starting on `line`.
 *
 * `sections` is root-level, so the follower is absorbed exactly when no root section starts
 * on its line. The string is `${type}@${startLine}`, built in this file with one `@` and a
 * numeric tail -- so unlike the LINK projection, which these notes record as not
 * round-trippable because `a|b|c` cannot be split back into target and display, this one has
 * an unambiguous delimiter and may be read.
 */
const absorbed = (facts: Facts, line: number): boolean =>
  !facts.sections.some(
    (section) => Number(section.slice(section.lastIndexOf("@") + 1)) === line,
  );
const BATCH = 60;
for (let at = 0; at < cases.length; at += BATCH) {
  const slice = cases.slice(at, at + BATCH);
  const answers = askBatch(slice.map((entry) => entry.text));
  // The DOM half costs a second round-trip, so it is fetched only where it can decide
  // anything: eight of the fourteen inline constructs are invisible to the cache, and none
  // of the block axes has an inline construct in it at all.
  const domWanted = inlinePairs || inlineBlock;
  const domAnswers = domWanted
    ? askDom(slice.map((entry) => entry.text))
    : undefined;
  for (const [index, entry] of slice.entries()) {
    const domTheirs = domAnswers?.[index];
    const want: Facts = {
      ...theirs(answers[index]),
      ...(domTheirs === undefined
        ? {}
        : {
            dom: {
              highlights: domTheirs.highlights,
              emphasis: domTheirs.emphasis,
              strike: domTheirs.strike,
              code: domTheirs.code,
              mathDisplay: domTheirs.math.map((entry) => entry.display),
            },
          }),
    };
    let got: Facts;
    try {
      got = domWanted
        ? { ...ours(entry.text), dom: oursDom(entry.text) }
        : ours(entry.text);
    } catch (error) {
      diverged.push(`${entry.name}  THREW ${String(error).slice(0, 60)}`);
      continue;
    }
    if (entry.followerLine !== undefined) {
      rules.set(entry.name, {
        obs: absorbed(want, entry.followerLine),
        us: absorbed(got, entry.followerLine),
      });
    }
    const same =
      JSON.stringify(want.defs) === JSON.stringify(got.defs) &&
      JSON.stringify(want.sections) === JSON.stringify(got.sections) &&
      JSON.stringify(want.headings) === JSON.stringify(got.headings) &&
      JSON.stringify(want.links) === JSON.stringify(got.links) &&
      JSON.stringify(want.embeds) === JSON.stringify(got.embeds) &&
      JSON.stringify(want.tags) === JSON.stringify(got.tags) &&
      JSON.stringify(want.refs) === JSON.stringify(got.refs) &&
      JSON.stringify(want.blocks) === JSON.stringify(got.blocks) &&
      JSON.stringify(want.dom) === JSON.stringify(got.dom);
    if (same) continue;
    diverged.push(
      `${entry.name}\n      md   ${JSON.stringify(entry.text)}\n` +
        `      obs  defs=${JSON.stringify(want.defs)} sections=${JSON.stringify(want.sections)} h=${JSON.stringify(want.headings)}\n` +
        `      ours defs=${JSON.stringify(got.defs)} sections=${JSON.stringify(got.sections)} h=${JSON.stringify(got.headings)}\n` +
        `      obs  l=${JSON.stringify(want.links)} e=${JSON.stringify(want.embeds)} t=${JSON.stringify(want.tags)} r=${JSON.stringify(want.refs)} b=${JSON.stringify(want.blocks)}\n` +
        `      ours l=${JSON.stringify(got.links)} e=${JSON.stringify(got.embeds)} t=${JSON.stringify(got.tags)} r=${JSON.stringify(got.refs)} b=${JSON.stringify(got.blocks)}` +
        (want.dom === undefined
          ? ""
          : `\n      obs  dom=${JSON.stringify(want.dom)}\n      ours dom=${JSON.stringify(got.dom)}`),
    );
  }
}

if (matrix) {
  const width = Math.max(...BLOCKS.map(([name]) => name.length));
  const head = CONTAINERS.map((c) => c.slice(0, 7).padStart(8)).join("");
  console.log(
    `  absorbed by the container?  A = absorbed, R = own root section`,
  );
  console.log(`  a cell is "obs/ours", and a disagreeing cell is marked *\n`);
  console.log(`  ${"follower".padEnd(width)}${head}`);
  for (const [followerName] of BLOCKS) {
    const cells = CONTAINERS.map((container) => {
      const rule = rules.get(`${container} > ${followerName}`);
      if (!rule) return "     -  ";
      const pair = `${rule.obs ? "A" : "R"}/${rule.us ? "A" : "R"}`;
      return `${rule.obs === rule.us ? " " : "*"}${pair}`.padStart(8);
    }).join("");
    console.log(`  ${followerName.padEnd(width)}${cells}`);
  }
  console.log("");
}

console.log(`  ${diverged.length} of ${cases.length} diverge\n`);
for (const entry of diverged.slice(0, 200)) console.log(`  ${entry}`);
if (diverged.length > 200) {
  console.log(`  ... and ${diverged.length - 200} more`);
}
