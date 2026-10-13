/**
 * One consolidated view of every oracle, axis and scope boundary in this harness.
 *
 * The REGISTRY half. `overview.mts` prints it; `overview.test.ts` gates it against drift.
 * This exists because of a measured failure, not for presentation. Three times in one
 * session a metric was reported as missing when it was already present AND already
 * answering the question: `normalize.ts` had the container-nested-heading rule, so our
 * projection already dropped a node our tree keeps; `container-setext.ts` had the
 * render-versus-index asymmetry written down; and `frontmatter` was already argued as a
 * scope boundary rather than debt. The knowledge existed, spread across twelve instruments
 * and some thousands of lines of docstring, and re-deriving it produced wrong answers.
 *
 * So the load-bearing column here is not a number. It is `blind` -- what each oracle CANNOT
 * see -- because every one of those three mistakes was about coverage rather than about a
 * count, and no amount of running the gates would have corrected them.
 *
 * It must not be allowed to go stale, since a summary that paraphrases its sources is
 * exactly the failure these notes already record: "a correction recorded in a source file
 * does not propagate to a summary that paraphrases it, and the summary is what gets read
 * when choosing work." Two defences. Nothing here restates a ceiling VALUE -- each entry
 * names the file that owns it, so the number is read at the source. And `overview.test.ts`
 * asserts that every `*.test.ts`, every `PROJECTION_KEYS` entry and every compute `KEY` is
 * registered below, so a new oracle or projection cannot be added without appearing here.
 */
// Deliberately imports NOTHING from `types.js`. The key lists here are spelled out so
// `overview.test.ts` compares an independent claim against them; importing them back would
// restore the tautology proved out above.

export type GateKind =
  /** Diverging fails CI, for pinned triage states only. */
  | "regression"
  /** Diverging is allowed up to a recorded, attributed count. */
  | "ceiling"
  /** Any violation fails, with no count to hold a line at. */
  | "absolute"
  /** Reported, never gated: the data is not vendored. */
  | "measurement"
  /** A sweep against a running Obsidian; no committed expectation. */
  | "sweep";

export interface Oracle {
  readonly name: string;
  readonly command: string;
  readonly gate: GateKind;
  /** Projection keys or properties this oracle actually asserts. */
  readonly compares: readonly string[];
  /** What it structurally CANNOT see. The reason this file exists. */
  readonly blind: readonly string[];
  /** The file owning its ceiling, so no number is restated here. */
  readonly ceilingAt?: string;
  /** The test enforcing it, if any. */
  readonly test?: string;
}

export const ORACLES: readonly Oracle[] = [
  {
    name: "main gate (corpus)",
    command: "npm test",
    gate: "regression",
    // SPELLED OUT, never spread from `PROJECTION_KEYS`. The first version wrote
    // `[...PROJECTION_KEYS]` here and the drift gate became a tautology: adding a key to the
    // source list added it to this claim too, so an unregistered projection passed. Proved by
    // injecting one -- the gate stayed green, which is the whole failure it exists to catch.
    // The registry has to be a HAND-MAINTAINED claim measured against the generated truth, or
    // it is measuring itself.
    compares: [
      "text",
      "sections",
      "math",
      "links",
      "tags",
      "headings",
      "tasks",
      "highlights",
      "emphasis",
    ],
    blind: [
      "anything metadataCache indexes but the DOM does not show, and the reverse",
      "crashes: it only ever compares successful parses",
      "a construct absent from all 3403 cases -- a clean delta against a corpus with no case for the rule is not evidence",
    ],
    test: "parity.test.ts",
  },
  {
    name: "compute (metadataCache)",
    command: "npm test",
    gate: "ceiling",
    // Spelled out, for the tautology reason recorded on the main gate above.
    compares: [
      "footnotes",
      "footnoteRefs",
      "headings",
      "sections",
      "links",
      "embeds",
      "tags",
      "blocks",
      "listItems",
      "referenceLinks",
      "frontmatterPosition",
    ],
    blind: [
      "rendering-only divergence: a setext inside a container is PAINTED and not INDEXED, so headings is empty on both sides either way",
      "frontmatter content and frontmatterLinks -- out of scope, we do not parse YAML",
      "two rows that MUST NOT be fixed: the P1 cache column defect, and one embed ordering outlier",
    ],
    ceilingAt: "compute.test.ts",
    test: "compute.test.ts",
  },
  {
    name: "referee (sibling corpus)",
    command: "PARITY_REFEREE_DIR=... tsx test/parity/referee.mts",
    gate: "measurement",
    compares: ["footnote definitions", "footnote references"],
    blind: [
      "section geometry: scored 0 of 6818 documents on the container-comment rule, so it cannot adjudicate that family at all",
      "positionless nodes -- it excludes them, which is why driving that count down moves agreement either way",
      "anything that is not a definition or a reference",
      "a net total hides a one-for-one trade; use --ids and diff the member set",
    ],
  },
  {
    name: "tree invariants",
    command: "npm test",
    gate: "absolute",
    compares: [
      "child within parent",
      "siblings non-overlapping",
      "span within source",
      "mdast content model",
    ],
    blind: [
      "whether the tree matches OBSIDIAN -- it only checks the tree against itself",
      "10 span rows are upstream's own overlap and MUST NOT reach zero",
    ],
    ceilingAt: "invariants.test.ts",
    test: "invariants.test.ts",
  },
  {
    name: "round-trip",
    command: "npm test",
    gate: "ceiling",
    compares: ["serialise/re-parse convergence", "never throws"],
    blind: [
      "correctness: a stable wrong output converges happily",
      "inherent math debt, where no spelling is both what Obsidian renders and inert on re-parse",
    ],
    test: "roundtrip.test.ts",
  },
  {
    name: "positioned points",
    command: "npm test",
    gate: "ceiling",
    compares: ["offset/column agreement", "unplaced nodes by kind"],
    blind: ["whether a placed offset is the RIGHT offset"],
    ceilingAt: "points.test.ts",
    test: "points.test.ts",
  },
  {
    name: "option matrix",
    command: "npm test",
    gate: "absolute",
    compares: ["no crash under any single option toggle, both presets"],
    blind: [
      "correctness -- Obsidian has no such configuration, so there is no oracle",
      "crashes needing TWO options to co-occur: 1104 parses, a scheduled job rather than a push gate",
    ],
    test: "option-matrix.test.ts",
  },
  {
    name: "hygiene",
    command: "npm test",
    gate: "ceiling",
    compares: [
      "pass order-coupling map",
      "triage notes present",
      "corpus/golden agreement",
      "preset coherence",
    ],
    blind: [
      "it is a FRAGILITY MAP, not a bug list: the chain never claimed idempotence",
    ],
    test: "hygiene.test.ts",
  },
  {
    name: "lossiness",
    command: "npm test",
    gate: "absolute",
    compares: ["no source characters dropped from the tree"],
    blind: ["where dropping is correct and belongs to the renderer"],
    test: "lossiness.test.ts",
  },
  {
    name: "chain pinning",
    command: "npm test",
    gate: "absolute",
    compares: ["the pinned Quartz plugin set and its order"],
    blind: ["whether the pinned order is the RIGHT order"],
    test: "chain.test.ts",
  },
  {
    name: "composition sweeps",
    command:
      "tsx test/parity/compose.mts [--matrix|--inside|--nested|--isolate]",
    gate: "sweep",
    compares: ["defs", "sections", "headings"],
    blind: [
      "INLINE constructs entirely -- all 16 BLOCKS entries are block-level",
      "text, math, links, tags, tasks, highlights, emphasis: not compared here",
      "rows are binary, so a position-without-extent fix moves nothing",
    ],
  },
  {
    name: "pass order",
    command: "tsx test/parity/pass-order.mts",
    gate: "sweep",
    compares: ["which of 62 pass units are position-sensitive"],
    blind: [
      "position-independent means ON THIS CORPUS: a free result retires a CLAIM, not a constraint",
    ],
  },
  {
    name: "rule scorer",
    command: "PARITY_REFEREE_DIR=... tsx test/parity/score.mts [name]",
    gate: "measurement",
    compares: ["a candidate rule's better/worse/same over 6818 documents"],
    blind: [
      "anything outside definitions and references, inheriting the referee's blindness",
      "a rule touching nothing is NOT ADJUDICABLE rather than negative",
    ],
  },
];

export interface Axis {
  readonly name: string;
  readonly sequences: number | null;
  readonly swept: boolean;
  readonly note: string;
}

/** Composition axes, swept and unswept. The unswept rows are the point. */
export const AXES: readonly Axis[] = [
  {
    name: "block > block (pairs)",
    sequences: 256,
    swept: true,
    note: "every ordered pair of 16 block constructs",
  },
  {
    name: "block > spacer > absorbable",
    sequences: 140,
    swept: true,
    note: "--isolate; proved container STATE, not adjacency",
  },
  {
    name: "container x follower (absorption)",
    sequences: 80,
    swept: true,
    note: "--matrix; one absorption bit per side",
  },
  {
    name: "block inside container",
    sequences: 64,
    swept: true,
    note: "--inside",
  },
  {
    name: "nested containers, both halves",
    sequences: 192,
    swept: true,
    note: "--nested",
  },
  {
    name: "inline x inline",
    sequences: 196,
    swept: false,
    note: "14 inline constructs, no pair matrix exists",
  },
  {
    name: "inline x block",
    sequences: 224,
    swept: false,
    note: "14 inline constructs at 16 block positions",
  },
  {
    name: "option pairs (crash only)",
    sequences: 1104,
    swept: false,
    note: "single toggles are covered; pairs are not",
  },
];

export interface ScopeBoundary {
  readonly what: string;
  readonly why: string;
}

/**
 * Deliberate non-measurements, with the argument.
 *
 * Registered because an undocumented scope boundary reads exactly like debt, and chasing one
 * as debt has cost real time here. Each of these has been checked at least once.
 */
export const SCOPE: readonly ScopeBoundary[] = [
  {
    what: "frontmatter content, frontmatterLinks",
    why: "both need the YAML parsed; Quartz's FrontMatter plugin owns it and remark-frontmatter is not in the pinned chain, so computeOurs emits neither",
  },
  {
    what: "callouts and frontmatter as rendered constructs",
    why: "obsidian-flavored-markdown and Quartz own them; the affected cases are triaged out-of-scope",
  },
  {
    what: "vault resolution and recursive embedding",
    why: "this harness models no vault, so a self-embedding note cannot be reproduced",
  },
  {
    what: "Obsidian's own cache defects",
    why: "reproducing the P1 column defect would write a wrong offset into our tree, and a consumer splicing by offset would corrupt the file",
  },
  {
    what: "a link's TARGET in isolation",
    why: "the projection string ${original}=>${link}|${display}@${span} is not round-trippable, so only whole-string comparison is sound",
  },
  {
    what: "rendering-only divergence",
    why: "metadataCache indexes rather than renders: a setext inside a container is painted and not indexed, so an index oracle is structurally blind to it",
  },
];
