# AGENTS.md

Operational brief for `@quartz-community/remark-obsidian`. Everything here is a fact that cost
measurement to establish, or a trap that has already wasted a session. Prose belongs elsewhere.

## What this package is

A remark plugin that makes a micromark/mdast pipeline parse Markdown the way **Obsidian** does.
Correctness is measured, not asserted: a harness renders a generated corpus inside real Obsidian
and compares against our output, currently **6,818 recorded documents**.

Obsidian internally runs a fork of **`remark-parse@8`** (rp8) — the pre-micromark architecture, a
line-oriented tokenizer loop with an explicit `interruptors` list. We reproduce rp8's _behaviour_
on micromark's _architecture_. That mismatch is the source of nearly every open problem.

## Two modes, two audiences

|                                                                                                                   | `legacy`                                                   | `strict`                  |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------- |
| Obsidian syntax (wikilinks, embeds, callouts, tags, `%%`, `==`, `$`, frontmatter)                                 | on                                                         | **on**                    |
| Obsidian's inherited rp8 divergences (emphasis, lists, entities, autolinks, code spans, html blocks, link labels) | on                                                         | **off**                   |
| consumer                                                                                                          | Obsidian plugins (`obsidian-linter`, `obsidian-footnotes`) | **Quartz**                |
| requires                                                                                                          | exact tokens **and exact positions**                       | CommonMark/GFM compliance |

`legacy` is the current default. Positions are a hard constraint for it — plugin consumers index
by them, so a correct token at a wrong offset is a failure.

**Strict is gated, and its backlog is closed.** The 6,818-document corpus measures `legacy`, so it
says nothing about strict — `strict.test.ts` is the gate that does, differentially against stock
`remark-parse` + `remark-gfm` over **676 examples**: the 652 CommonMark spec examples
(`commonmark.ts`) plus the 24 tagged GFM extension examples (`gfm.ts`). It opened at **32
divergences, 26 in node types**, and stands at **8**: seven are Obsidian syntax appearing by
design, and one is `raw-html/626`, already a recorded refusal. Unlike legacy, strict has a
_closed_ oracle — published specs with known answers — which is why it terminated.

Every one of the 27 closed was a legacy pass running **unconditionally**, with no option for
`strict` to clear. Six options now gate them: `legacySetext`, `legacyLinkDefinitions`,
`legacyTabs`, `legacyContainerLazy`, `legacyLinkDestinations`, `legacyTables`.

**Two specs are needed, not one, and the second is not optional.** GFM is "a strict superset of
CommonMark" (spec §1.1), so tables, task lists, strikethrough, extended autolinks and disallowed
raw HTML appear in **no** CommonMark example. Against CommonMark alone, the six table passes
reported "owns no spec example" — which means _the spec has no coverage there_, not _this agrees_.
The GFM corpus found three table divergences on arrival. Obsidian's docs cite
`github.github.com/gfm` for GFM, and footnotes are in **neither** spec: GFM froze at `0.29-gfm`
in 2019 and GitHub shipped footnotes in 2021 without specifying them.

**The policy that follows: a behaviour differing between `legacy` and `strict` belongs behind an
option, never in an unconditional pass.** 51 of 57 unconditional passes own no spec example — most
operate on footnote definitions, which CommonMark has no example of, so the spec cannot adjudicate
them and gating them would be unmeasured.

## Gates — what "done" means

```bash
npm test          # 453 tests / 18 files. Contains the contract gate.
npm run typecheck # both tsconfig projects; the only type gate over test/
npm run lint      # src/**/*.ts ONLY -- does not cover test/
npm run format
npm run build
```

Inside `npm test`, three gates matter more than the rest:

- **`parity.test.ts` is the contract** — "matches Obsidian 1.14.4 on every case marked match."
  If this regresses, nothing else justifies the change.
- **`compute.test.ts`** records positioned-oracle ceilings inline. Its own docstring calls them
  "a backlog gate, not a perfection gate."
- **`probe-ledger.mts` / `goldens/probes.json`** — ~1,700 entries asserting **drift**, not
  agreement. There is no refresh subcommand on purpose; update `ours` only with a script that
  refuses to write when anything moved _away_.

The referee is **a measurement, not a gate**. A referee gain with a contract-gate regression does
not ship — that has been tried (+4 referee, contract 3438 → 3434) and rejected.

## Instruments

All take `PARITY_REFEREE_DIR` (default `/tmp/opencode/corrected-answers`) and need
`--conditions=development`.

| instrument           | answers                                                                    | trap                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `classify.ts`        | shared primitives: loading, position identity, populations, lift, sampling | **use this instead of re-reading the corpus**; `--self-test` must be green                                               |
| `referee.mts`        | how many of 6,818 documents agree                                          | diff `--ids` identities, **never totals**                                                                                |
| `mechanism.mts`      | which documents are ONE mechanism from agreeing                            | classifies EXTRA facts by _host_, MISSING by _cover_                                                                     |
| `ablate.mts`         | per-flag DECISIVE / CULPABLE                                               | accepts both id schemes; has `--self-test`                                                                               |
| `legacy-oracle.mts`  | documents where rp8 is right and we are wrong                              | **rp8 needs `commonmark: true`** (see below); **it is not a ceiling** — we are right where rp8 is wrong in 742 documents |
| `referee-shrink.mts` | minimise a diverging document                                              | `--live` hits Obsidian                                                                                                   |
| `ask.mts`            | the live Obsidian oracle                                                   | see below                                                                                                                |

### `legacy-oracle.mts` specifically

**rp8 must be constructed with `commonmark: true`.** It is what accepts `1)` ordered markers, and
`commonmark` changes behaviour in **ten** rp8 files — `interrupt.js`, `definition.js`, `list.js`,
`paragraph.js`, `blank-line.js` among them, which is exactly the continuation and interruption
territory this effort re-derives. The instrument passed no options for a long time, so it ran
rp8's defaults where the flag is `false`, and every figure it produced was computed against the
wrong parser:

|                                  | wrong | correct |
| -------------------------------- | ----: | ------: |
| defs blueprint                   |   227 | **252** |
| defs we right where rp8 is wrong |  1023 | **742** |
| defs both wrong                  |   155 | **130** |
| code blueprint                   |    17 |  **33** |
| code we right where rp8 is wrong |   295 |  **24** |
| code both wrong                  |    21 |   **5** |

Correctly configured, rp8 explains nearly all root code-range behaviour — that dimension's
"we are right and rp8 is wrong" collapses from 295 to 24.

The **33** code-blueprint documents, classified through `referee.mts`'s own taxonomy (root
children only, `line - 1`, sorted compare — do not reimplement it, and note `ourFacts` in
`classify.ts` returns `{defs, refs}` with **no `code` field**, so reading `.code` off it yields
`undefined` and a uniform artifact):

|     |                                  |
| --: | -------------------------------- |
|  22 | **we report NO root code block** |
|   6 | count differs (1 vs 2)           |
|   2 | count differs (2 vs 1)           |
|   2 | a block STARTS elsewhere         |
|   1 | a block ENDS elsewhere           |

Hosts of the disagreeing first lines: 19 root · 10 list · 4 quote. So two thirds are one
bucket, and it is the same "we keep a line inside a container where Obsidian ends the container
and makes the line root indented code" mechanism the `code`-dimension work already names — not
a new rule, and mostly NOT list-hosted, which is the part that is easy to assume backwards.

### `ask.mts` specifically

- Needs **Obsidian running with a vault open**.
- **Never `2>/dev/null`.** It writes two load-bearing warnings to stderr: that `footnoteRefs` is
  definition-gated, and that the oracle runs **1.15.0** while goldens pin **1.14.4** — so do not
  settle a rule against the goldens with it.
- **Never `--synth` when reading references.** Synthetic answers omit the footnote keys entirely,
  so any probe reading refs through it measures nothing and looks like it worked.

Re-recording goldens is `npm run parity:record` (wdio) and needs Obsidian.

## Workflow

1. **Measure before choosing.** `mechanism.mts` names the buckets; it is the targeting instrument.
2. **Classify by position, through `classify.ts`.** Name-matching has produced a 12% contaminated
   classification and sent work after a mechanism that did not exist.
3. **Find the construct in source** — micromark's `node_modules/micromark/dev/lib/`, or rp8 spec
   sources if extracted. Cite file:line in the commit.
4. **Exclude narrowly. Do not flip a global flag.** Measured: setting `self.interrupt` across the
   flow map cost 41 documents at zero gained; restricting it to three constructs cost 292;
   excluding one construct from the unflagged probe gained 32.
5. **Gate all of it**, then commit **separately** — never chain the gate run and the commit.
6. **A refusal with numbers is a result.** Record it in the changeset so it is not re-attempted.

Priority heuristic, derived empirically — DECISIVE/CULPABLE ratio **≥0.5 build it · 0.2–0.5 narrow
it · <0.2 it is infrastructure, not the cause**.

### The flag map over the rp8 defs blueprint

Re-measured over the **corrected 252** (the earlier split ran on the wrong 227 — see
`legacy-oracle.mts` above). `matched 252 of 252 requested ids`, 30 flags each:

| flag                  | DECISIVE | CULPABLE | ratio |                            |
| --------------------- | -------: | -------: | ----: | -------------------------- |
| `callouts`            |        3 |        3 |  1.00 | perfect ratio, 3 documents |
| `comments`            |   **37** |       43 |  0.86 | **build**                  |
| `legacyLists`         |        9 |       29 |  0.31 | narrow                     |
| `math`                |       12 |       51 |  0.24 | narrow                     |
| `legacyContainerLazy` |        4 |       26 |  0.15 | infrastructure             |
| `legacyTabs`          |        2 |       14 |  0.14 | infrastructure             |
| `keepComments`        |        3 |       70 |  0.04 | infrastructure             |
| `bareFootnoteRefs`    |        7 |      190 |  0.04 | infrastructure             |
| `parseComments`       |        0 |       53 |  0.00 | infrastructure             |
| `inlineFootnotes`     |        0 |       27 |  0.00 | infrastructure             |

**The correction did not move the targeting**: `comments` was 35/41 = 0.854 on the wrong set and
is 37/43 = 0.860 on the right one. Re-running was still necessary — a split computed against the
wrong parser is not evidence of anything — but the conclusion it supports is unchanged, and that
is the result rather than a reason to discount it.

Three things this map says that are easy to get backwards:

- **`bareFootnoteRefs` is the biggest mover in the package and almost never the cause.** It is
  CULPABLE in 190 of 252 and DECISIVE in 7. A flag that changes an answer is not a flag that
  fixes it, and this one changes nearly everything.
- **`callouts` at 1.00 is the C2 trap, not a target.** A perfect ratio over 3 documents says
  nothing; population comes before ratio, which this file already records costing a session.
- **37 of 252 are moved by NO flag at all** (14.7%). Their mechanism is unconditional and has no
  switch, so no amount of ablation will name it — these are where the unconditional passes live,
  and where the policy above ("a behaviour differing between `legacy` and `strict` belongs behind
  an option") has the least coverage.

### Finding which pass owns a divergence

For a strict divergence, do not reason about which pass is responsible — **derive it**. Patch one
unconditional call site to `if (false) …`, run `strict.test.ts`, and read which spec examples the
stale-entry test says now agree. Restore, repeat. 57 passes take about five minutes, and the five
options above were all scoped this way.

Three things that recipe got right and guessing would not have:

- **Probe one at a time.** A wholesale run disabling all 14 tab passes closed five examples and
  named none of them.
- **Then probe pairs for whatever is left over.** `block-quotes/238` is owned **jointly** by
  `quoteIndentedCodeTransform` and `quoteLazyIndentedCodeTransform` and by neither alone.
- **Measure before naming the option.** `legacyLinkDefinitions` looked like it owned the whole
  link-reference-definition family; it owns six of eight, and the other two were a different
  cause entirely.

## Architectural conclusion (do not re-litigate without new evidence)

Roughly 184 divergences are **flag-irreducible**: no single flag and no pair of 24 reaches them.
An owner-aware "interruption broker" was the proposed general fix. It was **built as a shadow
instrument and failed its own contradiction test** — for owner `footnoteDefinition`, 29 of 52
observable tuples demand both _continue_ and _interrupt_, and that survived excluding container
closures and blank lines. `gfmTable lt4` sits at 25/26, a coin flip.

Consequence: **narrow per-construct exclusions are the correct strategy, and the remaining gap is
architectural rather than a cleverness deficit.** Forking micromark's document initializer is also
closed off — `parse.js` hardcodes it and `mdast-util-from-markdown` imports `parse` directly.

### `footnoteDefinition > code|math` escaping its parent is NOT a parity target

211 violations over 210 documents, the largest structural family in the corpus, and it looks like
the extent bug the `def-span` work keeps colliding with. Measured, it is not:

|     |                                        |
| --: | -------------------------------------- |
| 185 | **fully agree with Obsidian** (88.1%)  |
|  19 | disagree on definitions or their spans |
|   6 | disagree on references only            |

Against a 7.5% base rate over the 6,608 documents without the escape, that is a lift of **1.58x**
— inside the noise band this file already records refusals at (1.24 and 1.25, with 1.45 the
strongest in a whole table). So the escape barely predicts disagreement.

And it is worse than merely unhelpful: the escape is **load-bearing for agreement in 185
documents**. Making a definition contain its children would move all of them to gain at most 19.
The structural violation is an mdast-correctness matter for `invariants.test.ts` to ceiling, not a
parity lead.

### The "code node covers an indexed position" family is NOT one mechanism

It has been written up as the largest single target in the effort — "233 documents, 22% of the
queue, one cause", wanting the five-space cap in `legacy-list.ts`'s `tokenizeIndent`. Re-measured,
both halves of that are wrong.

It is **148 documents, not 233**: the figure predates several landings and was inherited rather
than re-derived. And it splits by host and then by marker separator into sub-families where none
exceeds 45:

|     |                                                                                          |
| --: | ---------------------------------------------------------------------------------------- |
|  45 | root-hosted                                                                              |
|  33 | blockquote-hosted                                                                        |
|  28 | list-hosted, separator holds a TAB — **already refused four ways, ceiling 10 documents** |
|  23 | list-hosted, separator is 1–4 spaces — an ordinary item, so a different cause entirely   |
|  21 | list-hosted, separator ≥5 spaces — **the only part the five-space cap addresses**        |
|   6 | footnoteDefinition / callout                                                             |

So the deep tokenizer change was aimed at **21 documents**, in a function already carrying two
recorded refusals (`got` measured in columns: −38; `initialSize` in columns: inert). The standing
rule applies to it — read `better + worse + same` first, and a total that small does not justify
the pass however the sign comes out.

## The upstream rules document, and what it already settles

`obsidian-footnotes` (the project the referee corpus comes from) carries
`docs/obsidian-reading-rules.md` — rules **A–P** with the probe ids that establish each, plus
reference implementations in `src/parsing/`. Clone it before deriving an Obsidian rule by hand;
most are already written down there, with the family that proves them.

Verified against our parser:

| rule                                                        | us                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| **E4** definition enders only within the first 1,024 chars  | correct, boundary exact                                            |
| **B8** a task box holds ANY one character                   | correct, all of `[ ] [x] [/] [-] [>] [!]`                          |
| **B9** lists split by only blank lines are ONE list         | correct, and a definition between keeps them apart                 |
| **D6** a link reference definition reads across blank lines | **diverges** — the title does not absorb, so its `[^1]` stays live |
| **A1** a callout title needs EOL/space/tab after `[!type]`  | correct — `callout.ts:21` enforces it with `(?=[ \t\n]\|$)`        |

`probe:a` is 5 of 121, and the A1 check above is why only one of the five is a callout question at
all. Four are ONE shape — `> [!note]` / `> 2. [^1]: def` — where the DEFINITIONS agree at
`1@1@5` and we emit an **extra reference at that same position**, which Obsidian does not. All
four title spellings (`[!note]`, `[!note]+`, `[!NOTE]`, `>[!note]`) behave identically, so the
title grammar is irrelevant to them: the rule is that a label which SUCCEEDS in defining is not
also a bare reference. That is the exact complement of the asymmetry `parseComments` carries
(a label that FAILS to define is indexed as a reference, 710 documents), so the two cannot
conflict — but `footnote-bare.ts` has no such guard, and it inserts at three separate sites
(`:307`, `:472`, `:610`), so the change wants all three scoped together and scored first.

The fifth is `> [!note]Title` / `>⇥code[^2]`, where the glued title correctly makes it a plain
quote, and a plain quote indexes that reference at column 6 — the recorded probe
`> plain` / `>⇥code[^2]` → `obs 2@1:6`. We report nothing there, and the tree says why without
naming a cause: both the glued and the plain spelling produce `blockquote > paragraph`, but the
glued one ends `[text, break, text, text]` where the plain one ends `[text, break, text,
footnoteReference]`. Something splits the text and does not insert the reference, so the
`[^2]` stays literal inside a `text` node. The callout grammar is not the bug.

**`P1`/`P2` are Obsidian CACHE BUGS, and our answer is the right one — do not chase them.** The
cache reports a column as if a `%%` opener's indentation were absent (P1), and shifts the line
under a callout title by the outer container's width when the callout is nested (P2). The
document is explicit that their reader also keeps the true column and the referee lists a
representative as a known disagreement. We have no such record, so `night:p2b-task-sp-co-quoted`
counts against us at 6208 while being correct: obs column 8, ours 6, and 6 is right. Reproducing
it would violate the standing rule that this is not "match Obsidian including every bug".

## Rules that each cost a session

- **`self.containerState` must be saved and restored** around any container-interrupt probe.
  Container constructs write into it. Without this: 0 gained / **1,172 lost**.
- **Verify third-party internals against source before relying on them.** A claim that
  `constructs.flow` holds `content` and `codeIndented` was carried for days, used to justify a
  refusal, and is **false** — stock `flow` holds only `headingAtx`, `thematicBreak`,
  `setextUnderline`, `htmlFlow`, `codeFenced`; `codeIndented` is in `flowInitial`; paragraph is
  the fallback in `initialize/flow.js`.
- **Price predicates on the corpus, not on probes.** Eight oracle-verified probe rows coexisted
  with 84 corpus regressions.
- **Sample on a stride.** Six separate families were misdescribed by inspecting the shortest or
  first members. `strideSample` in `classify.ts` is the only sampler.
- **Zero and 100% are equally suspicious.** `0 diverging documents` came from an id-scheme
  mismatch; `652 of 652 differ` came from one additive root field (`data.lineOffsets`);
  `0 of 57 passes own anything` came from a matcher requiring double-quoted ids and reading only
  stdout, while vitest prints the assertion summary single-quoted; `0 of 24 GFM extension
examples` came from anchoring a fence pattern as `example$` when `cmark-gfm` tags the fence
  `example table`. **Both were over-strict matchers, two days apart.** Assert the count you expect
  before using what you extracted — 648 parsed against 672 present is what exposed the second.
- **An inert probe looks exactly like a working one.** Verify by identity (`--ids`), not by total.
- **Only a KNOWN-POSITIVE control proves a probe is live.** The `0 of 57` above was checked with a
  negative control first — a pass that owns nothing — which passed happily and proved nothing. The
  bug surfaced only on a case whose answer was known in advance: deleting a real entry from the
  recorded list and confirming the matcher found it. Scripts scraping tool output must capture
  **both streams** and must not assume a quote style.
- **Use the Edit tool, not scripted `python3`/`sed`, on prettier-formatted source.** Silent
  regex misses have cost four edits; nested parens defeat naive patterns.
- **`disable` matches on construct NAME.** A vendored replacement must take a new name
  (`legacyCodeFenced`, `legacyGfmFootnoteDefinition`) or a user disabling the stock name silently
  disables ours too.

## Conventions

- Conventional commit subjects. Bodies carry the **measurement** and a parity delta line.
- Every behaviour change gets a changeset. A provably inert `src/` change gets reverted, not
  shipped as dead code.
- Fix forward; do not rewrite history.
- `test/parity/README.md` is ~12,300 lines, write-only, and read by nothing — **do not add to
  it**. `COMMONMARK-DIVERGENCES.md` describes Obsidian-against-CommonMark (i.e. legacy) and is
  asserted by zero tests; it does not excuse a strict-mode divergence.
