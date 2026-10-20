import { LIVE_ANSWER_KEYS } from "./probe-channel.js";
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
  /**
   * Why this oracle has NO gate -- required for exactly those that have none.
   *
   * A structural field rather than a sentence inside `blind`, because the assertion over it
   * has to be sound: matching prose for "not gated" would pass on any entry that happens to
   * contain the words, which is theatre rather than a gate. With a field, "every oracle is
   * either gated or says why not" is checkable, and `overview.test.ts` checks it.
   *
   * That assertion is what turned an overstated claim into a true one. Enumerating the
   * oracles found THREE with neither a gate nor a reason -- `proxy fidelity`, `pass order`
   * and `rule scorer` -- after "it is now authoritative" had already been said out loud.
   *
   * NO COUNT IS QUOTED HERE, deliberately, and the reason is the same mistake one layer up:
   * the commit that added this assertion stated "eleven gated, four ungated" in its own
   * message, and the real partition is ten and five. A hand-typed tally of a thing the gate
   * already computes is the second-copy-that-rots pattern -- removed three times elsewhere in
   * this file today -- so the gate asserts the PARTITION (total, and exclusive) and the
   * numbers are read from `ORACLES` when anyone wants them.
   */
  readonly ungated?: string;
}

/**
 * Which instrument reads each live-channel dimension.
 *
 * A `Record` over `LIVE_ANSWER_KEYS`, so a field added to `Answer` fails to compile until it is
 * listed there AND given a reader here. That is the gate this session needed three times and did
 * not have: `code`, `listItems` and `blockCode` were each added to the channel and read by
 * nothing, and `listItems` had been sitting unread in the raw cache for the whole effort -- the
 * `referenceLinks` trap repeating, where a recorded field nobody compares looks exactly like a
 * field that agrees.
 *
 * "Nothing yet" is a legal value and the honest one for a field added ahead of its consumer. It
 * is a STRING rather than an omission, so the register says so out loud instead of the field
 * simply being absent.
 */
export const CHANNEL_READERS: Record<
  (typeof LIVE_ANSWER_KEYS)[number],
  string
> = {
  defs: "referee.mts, referee-shrink.mts, score.mts, grid.ts (def.* fields)",
  refs: "referee.mts, referee-shrink.mts, score.mts",
  refsTrustworthy:
    "referee-shrink.mts (liveSignature drops refs without it) and liveAgreesStrictly; forgetting it is recorded four times",
  code: "referee.mts (own dimension, 883 documents), score.mts, grid.ts (code.* fields)",
  listItems:
    "nothing yet -- added for item extent, and the break test showed it does NOT adjudicate the tab-separator family, so no instrument depends on it",
};

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
    compares: [
      "footnote definitions",
      "footnote references",
      "ROOT-LEVEL CODE BLOCK ranges -- recorded on 883 of the 6818 documents and read by nothing until now",
    ],
    blind: [
      "section geometry EXCEPT code sections: the container-comment rule scored 0 of 6818 on definitions, and that was read as the oracle being blind to geometry entirely -- which the `code` field disproves for 883 documents",
      "positionless nodes -- it excludes them, which is why driving that count down moves agreement either way",
      "code blocks INSIDE a container: the field records root level only, which is why comparing every `code` node agrees on 52.4% and comparing the tree's own children agrees on 82.9%",
      "anything that is not a definition, a reference or a root code block",
      "a net total hides a one-for-one trade; use --ids and diff the member set",
    ],
    ungated:
      "the corpus is a sibling project's test data on its own release cycle, so an exact figure would fail CI when THEY change it, and a floor would be the kind of bound `roundtrip` was converted away from",
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
    name: "recorded contradictions",
    command:
      "TOP=24 tsx test/parity/fuzz/contradictions.ts to see the shapes behind a failure",
    gate: "absolute",
    compares: [
      "no skeleton shape holds both a `match` case and a `replicate` one",
    ],
    blind: [
      "shapes with only diverging cases -- a contradiction needs both sides present",
      "the skeleton collapses word runs, so two documents differing only in WORDS are one shape",
      "triage states other than match/replicate, which are excluded by construction",
    ],
    test: "contradictions.test.ts",
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
    name: "probe ledger",
    command:
      "tsx test/parity/probe-ledger.mts --record <file.json> to add probes; --status to see drift",
    gate: "regression",
    test: "probes.test.ts",
    compares: [
      "footnote definitions and references for a probe, against OUR OWN answer at record time",
    ],
    blind: [
      "whether we AGREE with Obsidian -- it asserts stability, because a probe usually records a divergence and a gate demanding agreement would be red from its first entry",
      "anything the referee's projection drops: no columns beyond the definition start, no code ranges, no sections",
      "a probe nobody recorded -- the ledger is only as wide as the sweeps someone chose to keep, though `grid.mts --record` now promotes a whole GRID at once and closed most of that gap: of roughly three hundred cells measured by hand in one session only about a hundred and twenty had been written out again, and the six named grids brought the ledger from 498 to 754",
    ],
  },
  {
    name: "their rules document",
    command:
      "tsx test/parity/ask.mts to re-measure an example; the golden is goldens/rules-doc.json",
    gate: "ceiling",
    ceilingAt: "rules-doc.test.ts",
    test: "rules-doc.test.ts",
    compares: [
      "footnote definitions and references with full positions, column and offset included",
      "the block-identifier index",
      "source-backed section starts, type-agnostic",
    ],
    blind: [
      "`text` and every rendered projection: several of these examples turn on rendering, and `ask.mts` reads the raw cache with no equivalent of the recorder's `.footnotes` removal",
      "anything their document does not state -- it is someone else's input set, which is exactly why it finds what our generator cannot",
      "one entry is NOT ours: `P2 column quirk` is a cache defect we deliberately do not reproduce, so the diverging set is not a backlog",
    ],
  },
  {
    name: "composition axes",
    // `--all` measures every axis; per-axis flags live on AXES rather than being spelled out
    // here, because the spelled-out version went stale within a day. No count is quoted
    // either: `compose.test.ts` holds the exact per-axis diverging set, which is the only
    // copy that cannot drift.
    command:
      "tsx test/parity/compose.mts --all to measure, --record to re-record the golden",
    gate: "ceiling",
    ceilingAt: "compose.test.ts",
    test: "compose.test.ts",
    compares: [
      "defs",
      "sections",
      "headings",
      "links",
      "embeds",
      "tags",
      "footnoteRefs",
      "blocks",
      "highlights",
      "emphasis",
      "strike",
      "code",
      "math",
    ],
    blind: [
      "the `text` projection, and `tasks` -- neither is compared on any axis",
      "rows are binary, so a position-without-extent fix moves nothing",
      "the DOM half is fetched only on the inline axes, since no block axis holds an inline construct",
    ],
  },
  {
    name: "proxy fidelity (detached vs real Reading View)",
    command:
      "obsidian dev:cdp method=Emulation.setFocusEmulationEnabled params='{\"enabled\":true}' then tsx test/parity/proxy-agrees.mts [n]",
    gate: "measurement",
    compares: [
      "highlights, emphasis, strike, code, text and math display, detached against a real view",
    ],
    blind: [
      "the block separator, normalised away because Reading View runs block divs together while the proxy's newlines collapse to a space -- both counts are reported so the blunt one never stands alone",
      "it needs CDP focus emulation; without it reading mode renders NOTHING and every capture is empty, which reads as agreement with whatever you expected",
    ],
    ungated:
      "it audits whether the GOLDENS' capture method is faithful, so the goldens cannot be the thing it is checked against; and it needs the app plus a CDP command, which CI has neither of",
  },
  {
    name: "DOM probe fidelity",
    command: "tsx test/parity/probe-agrees.mts",
    gate: "measurement",
    compares: [
      "the probe's highlights, emphasis and math against the committed goldens",
    ],
    blind: [
      "strike and code, which the recorder has no projection for, so there is no golden to agree with",
      "it compares two call paths into the SAME renderer, not the renderer against reality",
    ],
    ungated:
      "the probe's answers are baked into `goldens/compose.json` at RECORD time, exactly as the recorder's are baked into `obsidian.json`, so the golden is what CI defends",
  },
  {
    name: "pass order",
    command: "tsx test/parity/pass-order.mts",
    gate: "sweep",
    compares: ["which of 62 pass units are position-sensitive"],
    blind: [
      "position-independent means ON THIS CORPUS: a free result retires a CLAIM, not a constraint",
    ],
    ungated:
      "by choice rather than necessity -- it needs no Obsidian, but it REWRITES `src/index.ts` in place and restores it in a `finally`, which a push gate should not do to a working tree, and it rehashes every corpus tree under both profiles per unit",
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
    ungated:
      "there is nothing to gate: it scores HYPOTHETICAL rules, so with no candidate under consideration it asserts nothing about the package. It also inherits the referee's non-vendored corpus",
  },
];

export interface Axis {
  readonly name: string;
  readonly sequences: number | null;
  readonly swept: boolean;
  readonly note: string;
  /**
   * How to run it, as the flag or env var -- the SINGLE source for that string.
   *
   * The composition oracle's `command` used to spell the flag list out separately and went
   * stale within a day: it still read `[--matrix|--inside|--nested|--isolate]` after
   * `--inline` and `--inline-block` were added. A second copy of a fact is the thing that
   * rots, which is the lesson this whole file exists for -- so the printer derives the
   * command from these and there is no list to forget.
   */
  readonly how?: string;
}

/** Composition axes, swept and unswept. The unswept rows are the point. */
export const AXES: readonly Axis[] = [
  {
    name: "block > block (pairs)",
    how: "compose.mts",
    sequences: 256,
    swept: true,
    note: "every ordered pair of 16 block constructs -- GATED by compose.test.ts against a committed golden, so a regression fails CI",
  },
  {
    name: "block > spacer > absorbable",
    how: "compose.mts --isolate",
    sequences: 140,
    swept: true,
    note: "--isolate; proved container STATE, not adjacency",
  },
  {
    name: "container x follower (absorption)",
    how: "compose.mts --matrix",
    sequences: 80,
    swept: true,
    note: "--matrix; one absorption bit per side",
  },
  {
    name: "block inside container",
    how: "compose.mts --inside",
    sequences: 64,
    swept: true,
    note: "--inside",
  },
  {
    name: "nested containers, both halves",
    how: "compose.mts --nested",
    sequences: 192,
    swept: true,
    note: "--nested",
  },
  {
    name: "inline x inline",
    how: "compose.mts --inline",
    sequences: 196,
    swept: true,
    note: "--inline; opened 7, ALL one rule (an inline closer frees a caret for a block id), now CLEAN over all 196. The last row was `#tag^blk`, and the mechanism is the tag's END rather than the word character before the caret -- read from the tree's `tag` nodes, so `word^blk` and `#1^blk` correctly register nothing",
  },
  {
    name: "inline x block",
    how: "compose.mts --inline-block",
    sequences: 224,
    swept: true,
    note: "--inline-block; opened 5, AT ITS FLOOR at 4 -- every one the P1 cache defect, offsets short by the `%%` width, MUST NOT be fixed",
  },
  {
    name: "option pairs (crash only)",
    how: "PARITY_OPTION_PAIRS=1 vitest run option-matrix",
    sequences: 552,
    swept: true,
    note: "PARITY_OPTION_PAIRS=1; 552 configs x 3403 cases, ZERO crashes, ~16 min so opt-in",
  },
  {
    name: "inline CONTENT of the eight unindexed constructs",
    sequences: 420,
    swept: true,
    how: "compose.mts --inline / --inline-block (DOM half via ask-dom.ts)",
    note: "CLOSED by the parity-probe plugin: highlight/emphasis/strong/underscore/strike/imath/dmath/codespan report nothing to metadataCache, so a detached MarkdownRenderer supplies them. All eight AGREE across both inline axes",
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
    what: "a link's TARGET in isolation -- CLOSED",
    why: "was: the projection string ${original}=>${link}|${display}@${span} is not round-trippable, since `[[a|b|c]]` records as `a|b|c` and could be target `a|b`. The DOM keeps them in separate attributes, so `ask-dom.ts` now reports `{target, display}` and `[[a|b|c]]` is unambiguously target `a`, display `b|c`",
  },
  {
    what: "block code only over the INTERMITTENT transport -- CLOSED",
    why: "was: `blockCode` arrived through `ask-dom.ts`, which rides `obsidian eval` -- a channel that returns NOTHING when it fails, reading as a real empty answer, and which failed on the first run of the probe that closed the blind spot. Tolerable for a field nothing depended on, unacceptable once `blockCode` is the only oracle for block structure inside a container. `__parityProbe` is a DETACHED `MarkdownRenderer.render()`, needing neither focus nor rAF, so `serveBatch` serves it and `askBlockCode` reads it over the file channel: six of six against the CLI, including a control proving a root `pre` is distinguished from `ul>li>pre`. Opt-in per question, since a detached render costs far more than a cache call",
  },
  {
    what: "an item's EXTENT in the live channel -- CLOSED",
    why: "was: `listItems` rides on every raw cache answer and `probe-channel.ts` dropped it, declaring only `footnotes`, `footnoteRefs` and `sections`. `compute.test.ts` compares a listItems projection against the GOLDENS, so the field was known and near-total there -- what was missing is the span and the nesting LIVE, where every grid and sweep is built, so no probe could ask how far an item reaches of a document not already in the corpus. The break test then refused the use it was added for: all four tab-separator spellings report one item covering the whole line, so that family is not an extent question, which is why `blockCode` was needed beside it rather than instead of it. What it is live for is cross-line extent -- `- a` / `<TAB># h` spans to 1:4, the shipped lazy-release rule confirmed on a document the corpus never had",
  },
  {
    what: "BLOCK structure inside a container -- CLOSED",
    why: "was: no channel could answer \"did this item's content become a code block\". `sections` is root-level by construction, so a definition inside a list item reports `list@0-0` and nothing else; `ask-dom.ts`'s `code` excluded `<pre>` deliberately; live preview is a different parser. So every conclusion about a container's internal blocks was INFERRED from whether a definition survived -- which is how `*<2sp><TAB>[^1]:` reporting no definition and `*<TAB><2sp><TAB>[^1]:` reporting one stood as a contradiction no arithmetic explained. `blockCode` reports every `pre > code` with its NESTING PATH, and answers it directly: the first is `ul>li>pre` and the second is nothing. The path matters -- a `<pre>` at root and a `<pre>` inside an `<li>` are different answers",
  },
  {
    what: "rendering-only divergence -- CLOSED",
    why: 'was: metadataCache indexes rather than renders, so an index oracle cannot see a construct Obsidian paints and does not index. `ask-dom.ts` reports RENDERED headings beside the cache\'s indexed ones: `> text` / `> ---` is `["2:text"]` rendered against `[]` indexed, which makes the class measurable rather than merely registered',
  },
  {
    what: "the goldens are a recording, not live Obsidian",
    why: "green means 'matches the version stamped in the golden'. The weekly drift job re-records against latest and opens an issue rather than committing, so an Obsidian change surfaces there and not in the push gate",
  },
  {
    what: "a divergence inside a normalised region -- CLOSED, measured both halves",
    why: "the LINK half is gone: the probe reports target and display separately, so the non-round-trippable projection string is no longer the only source. The MATH half was never a blindness, which is now measured rather than argued -- comparing the probe's `data-latex` against our own tex EXACTLY across all 199 match cases carrying math gives 191 byte-identical, 8 differing by whitespace only, and ZERO differing substantively. The 8 are the documented class (`$$\\nx\\n$$` is `\\nx\\n` to Obsidian and `x` to remark-math, plus container indent surviving a fragment re-parse) and TeX collapses whitespace runs, so they render identically. Nothing hides in there",
  },
  {
    what: "crashes needing two options at once -- CLOSED",
    why: "was unmeasured; the pair sweep now runs behind PARITY_OPTION_PAIRS=1 at 552 configurations against the whole corpus, zero crashes. Opt-in because it is 16 minutes, not because it is unavailable",
  },
  {
    what: "the eight unindexed inline constructs -- CLOSED",
    why: "was: highlight, emphasis, strong, underscore, strike, imath, dmath and codespan report nothing to metadataCache, so only the 70-second recorder could see them. `test-vault/.obsidian/plugins/parity-probe` exposes a detached MarkdownRenderer, validated against the goldens at 663 of 663, and both inline axes now compare all eight",
  },
  {
    what: "real Reading View past the seed layer -- CLOSED",
    why: "was blocked, then measured, then closed. `__parityReadingView` drives an actual view; it rendered nothing because reading mode runs off requestAnimationFrame, which Chromium starves for an UNFOCUSED window (`docFocus: false`, `sectionKids: 0`, while the chrome rendered fine). The unlock is CDP focus EMULATION, which reports the page as focused without taking focus from the desktop: `obsidian dev:cdp method=Emulation.setFocusEmulationEnabled params=\'{\"enabled\":true}\'`. With it, `proxy-agrees.mts` compares the detached render against a real Reading View per document: 150 of 150 strided match cases AGREE, 14 of them only after normalising the block separator -- which is a capture artifact (Reading View appends block divs with no whitespace; the proxy\'s markup newlines collapse to a space) and already documented as the reason a corrected `text` is only commensurable for a single-block document. So the proxy is faithful beyond the seed layer, measured rather than assumed",
  },
];
