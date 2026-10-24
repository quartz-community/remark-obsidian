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

**The obvious repair for that bucket is REFUSED at 0.1%, and the reconciliation is why.** 21 of
the 22 have obs's code starting on a line indented four or more columns (16 spaces, 5 a tab),
which reads as "we nest an indented-code block that Obsidian puts at root" and suggests moving
it. Measured over every nested code node we produce:

|                                                       |           |
| ----------------------------------------------------- | --------: |
| our nested (in-`listItem`) `code` nodes               | **1,637** |
| obs has a ROOT code range starting there — would GAIN |     **2** |
| obs does not — would BREAK                            | **1,635** |

And asking what covers obs's code start line in those 22 documents explains the 2 exactly:

|     |                                        |
| --: | -------------------------------------- |
|  20 | **NO code node anywhere** at that line |
|   2 | `list > listItem > code`               |

So in 20 of 22 we do not merely MISPLACE the code block — we never form one, because the line
is ordinary container content to us. The repair is upstream of code formation: the container has
to END, after which the line becomes root indented code on its own. Moving a node cannot reach
it, and the 2 that moving would reach are below the bar that refused C2 at two documents.

That is the fifth refusal in this territory, and the first to separate "misplaced" from "never
formed" — a distinction the `code` field cannot show by itself, since it records ROOT ranges
only and a nested block is simply absent from it.

**It is also visible in a minimal case, unlike the other families here**, which is the one
encouraging part: `- a` / blank / `⟨6sp⟩plain` gives `list > listItem > [paragraph, code]` where
B2's `- ` row puts six columns at the code threshold. So this bucket does not need a dense
document to reproduce, and a container-end rule could be scored against minimal probes before
anything is built.

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

| rule                                                        | us                                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **E4** definition enders only within the first 1,024 chars  | correct, boundary exact                                                             |
| **B8** a task box holds ANY one character                   | correct, all of `[ ] [x] [/] [-] [>] [!]`                                           |
| **B9** lists split by only blank lines are ONE list         | correct, and a definition between keeps them apart                                  |
| **D6** a link reference definition reads across blank lines | **diverges** — the title does not absorb, so its `[^1]` stays live                  |
| **A1** a callout title needs EOL/space/tab after `[!type]`  | correct — `callout.ts:21` enforces it with `(?=[ \t\n]\|$)`                         |
| **D2** frontmatter opens only on an EXACT `---` first line  | **diverges** — we open on `--- ` and `---⇥` too; 11 documents                       |
| **E2** a 4-space label after a definition line continues it | **diverges** — we define it instead; 2 documents                                    |
| **D1** nothing inside `[[ … ]]` is read                     | **refuted as a reference rule** — 5 gain / 37 break with the span derived correctly |
| **E3** everything inside `^[ … ]` is dead                   | 1 document diverges, and it is a rule CONFLICT (see below)                          |

**D1's predicate was wrong and fixing it did not rescue the rule**, which is the useful half.
The first scan took the nearest earlier `[[` on the line and scored 5 gain / 99 break. D1 says a
SECOND `[[` MOVES THE START, so the span has to be derived left to right, closing on the first
`]]`. Done properly the false fires drop from 99 to **37** and the gains stay at **5** — so the
tightening was real and the rule is genuinely wrong rather than mis-measured. Obsidian indexes a
footnote reference inside a closed wikilink span in 37 of 42 recorded cases, whatever D1 says
about contents not being parsed. Recording both numbers because a single 5/99 reads as "bad
predicate" and the pair reads as "bad rule".

**`probe:e3`'s last divergence is two rules colliding, not a missing one.**
`a^[x %% [^1] %% y] w[^2]` — we emit a surplus reference at `0:8`, the `[^1]` inside the inline
footnote. E3 says everything inside `^[ … ]` is dead; the F-rules say a reference inside `%%` is
STILL INDEXED, and 710 documents depend on that asymmetry. The `%%` here sits inside the inline
footnote, so the two rules disagree about the same character range and the comment rule is
winning. Inline-footnote inertness has to take precedence — a one-document fix, but the
precedence is worth settling because the two rules meet anywhere a comment is nested in an
inline footnote.

### `night:c6` is the largest family left at 11, and it is C1/C2 table formation

It was missing from the working queue entirely — found by sweeping every named family for its
CURRENT count rather than trusting the recorded one, which also showed this session's fixes
landing (`probe:a` 5→0, `probe:h3` 8→1, `probe:e3` 2→1). Across 21 families, 68 documents fail
and `night:c6` is the biggest single one. Three sub-shapes:

```
A (3)  ⟨1-3sp⟩| a | b |  /  ⇥| --- | --- |  /  [^2]: two
       obs d[2@2@0]            ours: NO definition, a bare reference at 2@2@0

B (2)  a | b  /  --- | ---  /  ⟨4sp or ⇥⟩| c[^2] | d
       obs indexes [^2] on line 2        ours: nothing there

C (1)  >||  /  |-|  /  >⟨5sp⟩||[^2]
       obs reports no reference          ours: a surplus one at 2@2@8
```

All three are the pipe-style and indentation rules, and the rules document settles each:

- **A** is C1's last clause, "a tab before the header makes it indented code" — so the
  delimiter cannot pair with the header, no table forms, and `[^2]: two` is then an ordinary
  root definition. We form the table and the label becomes lazy text instead.
- **B** is C2 verbatim, including its worked example: in a PIPELESS table a row "does not start
  with a pipe", so an indented `| c[^2] | d` is still a row and the reference is live. We read
  it as indented code and lose it.
- **C** is the inverse, in a quote, and over-indexes.

So the family is not one rule but three clauses of two rules, each with a written answer and
2–3 documents behind it. Worth noting that it is the same arithmetic as `legacyTables` and the
C1 refinement of 2026-10-03 ("the first-character test replaced 'after any spaces'", 45 notes
of that run) — so the pipe-style half is already implemented and it is the TAB and INDENT
interaction that diverges.

### D2's opener is measured, scoped, and DEFERRED at two documents

Eleven documents open with `---` followed only by spaces or tabs. We treat every one as
frontmatter; D2 says none of them is. Measured before building, which is what defers it:

|                                                      |        |
| ---------------------------------------------------- | -----: |
| documents whose first line is `---` + space/tab      | **11** |
| we open frontmatter                                  |     11 |
| currently AGREE with Obsidian anyway                 |      8 |
| the would-be frontmatter body holds a footnote label |  **2** |

Only the 2 carrying a label can move the referee, and they are exactly the two recorded
failures (`night:d2o-1`, `night:d2o-2`). The other 8 hold no label, so re-parsing cannot change
their footnote facts — the change is SAFE for them and worth nothing on this oracle. That makes
it a correct, fully-specified rule worth exactly two documents, which is the C2 situation
verbatim, and C2 was refused on exactly that.

Its structural half is real and unmeasured: `--- ` / `title: x[^1]` / `---` should read as a
thematic break, a paragraph and a setext underline — so an H2 whose text carries a live
reference, which is what obs reports at `1@1:8`. No corpus case covers it, so the `sections`
projection cannot adjudicate it either. It belongs with the six external-list gaps: blocked on a
recorded probe rather than on understanding.

**And the narrowing is load-bearing: the test must be SPACE AND TAB ONLY.** Two corpus cases,
`hunt/crlf-protection/0` and `/1`, carry `---\r` as their first line and are triaged `match`, so
a carriage return DOES open frontmatter. A `\s`-based test would have taken both out and broken
the contract gate for a rule that never applied to them.

`probe:a` is 5 of 121, and the A1 check above is why only one of the five is a callout question at
all. Four are ONE shape — `> [!note]` / `> 2. [^1]: def` — where the DEFINITIONS agree at
`1@1@5` and we emit an **extra reference at that same position**, which Obsidian does not. All
four title spellings (`[!note]`, `[!note]+`, `[!NOTE]`, `>[!note]`) behave identically, so the
title grammar is irrelevant to them: the rule is that a label which SUCCEEDS in defining is not
also a bare reference. That is the exact complement of the asymmetry `parseComments` carries
(a label that FAILS to define is indexed as a reference, 710 documents), so the two cannot
conflict. Scored: **better 4 / worse 0 / same 0**, referee 6229 → 6233.

**And it is NOT a `footnote-bare.ts` guard — that pointer was wrong.** Scoring it as a reference
filter measures the symptom; the tree names the cause:

```
callout@1:1
  paragraph@2:3            <- line 2 as a PARAGRAPH
    text@2:3  footnoteReference@2:6  text@2:10
  list@2:3                 <- line 2 ALSO as a LIST
    listItem@2:3
      footnoteDefinition@2:6
```

`paragraph@2:3` and `list@2:3` are SIBLINGS STARTING AT THE SAME POINT, so one source line is
represented twice: a pass inserted the `list` beside the paragraph it derived from instead of
replacing it, and the surplus reference is an ordinary child of a paragraph that should not
exist. Filtering the reference would make the four documents agree while leaving a tree holding
one line twice — a content-model defect the position and invariant gates exist to catch. The
repair is to drop the stale paragraph.

**The owner is `calloutTitleInterruptTransform`** (`src/index.ts:962`), derived with the recipe
above rather than guessed:

```
baseline          callout children: paragraph@2:3  list@2:3
pass stood down   callout children: paragraph@2:3
```

So it CREATES the `list` and never removes the `paragraph` it derived it from. The repair is to
replace rather than insert beside. Two cautions for doing it: the pass is reached only for a
TITLE-LESS callout whose interrupting marker is not `1` (the `start !== 1` scoping the compose
sweep established), and it takes a `reparse` callback, so the fragment it builds carries
fragment-relative offsets that `shift` fixes up — a replacement has to keep that fixup.

Deriving it cost two failed anchors, both already recorded here as traps. A `\([^)]*\)` regex
for the signature died on the nested parens in `reparse: (markdown: string) => Root`, and the
run printed the BASELINE tree under a "DISABLED" header — an inert probe reading exactly like a
working one. Only the `assert` on the anchor count caught it. Anchor on a literal, and assert
the match count before believing the probe.

The fifth was `> [!note]Title` / `>⇥code[^2]`, **fixed in `0e775bb`**: `quoted-tab-code.ts`
carried its own callout test, `/^[ \t]*>[ \t]*\[![^\]]+\]/`, which stops at the bracket and so
matched a glued title that A1 says is not a callout at all. Its suppression rule is right and
untouched; only the grammar copy was wrong. **`probe:a` is now 0 of 121.**

The general defect there is a DUPLICATED GRAMMAR: `callout.ts` holds the A1-verified `MARKER`
and a deliberately loose `AT_MARKER`, and this pass had a third spelling. A grammar copied into
a second file drifts from the verified one, and the copy is what ships in the pass nobody
re-checks. A sweep found no further copies.

### The nested-callout reference miss is an UNPLACED-NODE bug, and placing the title is not enough

`- > [!note] ` / `  > ab[^1]` — note the TRAILING SPACE, which is the whole discriminator:

```
"- > [!note] "   refs (none)   <- obs wants 1@1:6
"- > [!note]"    refs 1@1:6
"- > plain"      refs 1@1:6
```

Both spellings are valid callouts under A1, so this is not a grammar question. The reference is
not suppressed either — **it is in the tree with no position**, which is why the referee cannot
see it:

```
callout@1:3
  calloutTitle@NONE
  paragraph@1:13
    text@NONE "ab"   footnoteReference@NONE
```

Instrumented, the cause of the unplaced TITLE is exact: `title=""`, `firstLine=" "`,
`blankTitle=true`, `titleNodes=[]`. `blankTitle` admits a title made of no nodes at all, so
there is no head or tail to read and the `head && tail` spread leaves it unplaced.

**Giving it a zero-width position — the fix the block path at `callout.ts:315` already carries
for the same case — WORKS AND IS REVERTED, because nothing measures it.** It really does place
the node (`calloutTitle@1:11`), and:

|                               |             |
| ----------------------------- | ----------- |
| referee                       | 6234 → 6234 |
| unplaced nodes over all 6,818 | 54 → 54     |
| every gate                    | unmoved     |

The body is the real defect and it is a SEPARATE cause: `paragraph` keeps a line-1 position and
its children stay unplaced, so the reference is lost whatever the title does. Reverted rather
than shipped as unmeasurable, the same way `comment-region.ts`'s `openerIndent` was. Whoever
picks this up should start at the body paragraph, not the title.

### `probe:g4`, `probe:h2` and `probe:i1` are ONE rule, and it is 40 documents

Characterising `probe:h2` (4 of 264) and `probe:g4` (3 of 13) merges them into `probe:i1`'s
target rather than adding two. Five of the seven failures are one shape:

```
g4      1.⇥| a | b |  /  | --- | --- |  /  ⟨4sp⟩[^2]: two
        obs d[2@2@4]        ours: NO definition, a bare reference at 2@2@4

h2|ord  1. p  /  ⟨7sp⟩* [^1]: def
        obs d[1@1@9]        ours: NO definition, a bare reference at 1@1@9
```

Obsidian DEFINES a label we decline, and we emit a bare reference at the definition's own
position instead. That is the **exact mirror of `probe:a` group 1**, which emitted both and is
fixed in `f7597a3` — so the two halves of one asymmetry are now one fixed and one open.

Measured as a predicate over the whole corpus rather than sized from the families:

|                                                      |        |
| ---------------------------------------------------- | -----: |
| obs defines at P, we emit only a bare reference at P | **40** |
| of those, fully agreeing anyway                      |      0 |
| **actionable**                                       | **40** |

By what the label line looks like: 21 other · 7 a marker on the label line · 7 four-plus
spaces · 5 a leading tab. The 21 is the bucket to classify first, and note what it is NOT —
no marker, no leading tab, fewer than four spaces — so the obvious indent and marker stories
cover fewer than half of it, and reading the head of this family would get it backwards for
the eighth time.

**The obvious reading of this family is REFUTED at 2%, and that is the useful part.** Asked of
the tree rather than the fact tuples, 24 of the 40 land on a `break` or a `text` inside a
paragraph — the label line was absorbed as a paragraph continuation. B2's own preamble says the
table applies "for a line after a blank line", so these are the NO-BLANK case, and the minimal
probes isolate it exactly:

```
- p / ⟨2sp⟩[^1]: def        defs []            refs 1@1:2
- p / blank / ⟨2sp⟩[^1]:    defs 1@2:2         refs []
p  / [^1]: def              defs []            refs 1@1:0
> p / > [^1]: def           defs []            refs 1@1:2
```

With a blank we define, without one we never do, in every host. So the rule suggests itself: a
footnote definition INTERRUPTS a paragraph. Measured over what it would actually change —
positions where OUR tree emits a `footnoteReference` that sits on a real `[^x]:` label:

|                                         |           |
| --------------------------------------- | --------: |
| such positions                          | **1,938** |
| obs DEFINES there — the rule would GAIN |    **39** |
| obs does NOT — the rule would BREAK     | **1,899** |

**2.0%.** The same shape as the 57.5% refutation recorded below, four times worse. The 1,899
break down as 783 col 0 · 566 indented · 365 quoted · 185 a marker on the line — the same
shapes the 40 span, so no structural discriminator separates them and the family is narrow
rather than general. It also says the failed-label-becomes-a-reference asymmetry is
load-bearing far beyond the 710 documents already recorded for it.

**And the first version of this measurement was contaminated**, which is why it is stated from
the tree. A regex scan for label-shaped lines after a non-blank line reported 5,252 occurrences
at 34.4% — a figure that includes every label inside a fence, a comment or a code span. This
file's own rule covers it: where a rule's premise is structural, compute it from the tree. The
honest number is 2.0%, not 34.4%, and only one of those two is about the rule.

**And no feature separates the 39 from the 1,899**, which is the third narrowing and the one
that closes the family as a single rule. Five axes over those 1,938 positions, against a 2.0%
base rate:

| feature               |     n | defines |  rate | lift      |
| --------------------- | ----: | ------: | ----: | --------- |
| `inDefinition=YES`    |    41 |       7 | 17.1% | **8.48x** |
| `prevBlank=YES`       |    15 |       1 |  6.7% | 3.31x     |
| `firstLine=YES`       |    15 |       1 |  6.7% | 3.31x     |
| `textBeforeLabel=YES` |    47 |       1 |  2.1% | 1.06x     |
| `parent=paragraph`    | 1,913 |      39 |  2.0% | 1.01x     |
| `parent=heading`      |    17 |       0 |  0.0% | 0.00x     |

The only real lift is a label nested inside an EXISTING `footnoteDefinition` — 8.48x, and still
only 17% precise: 7 gained against 34 broken, covering 7 of the 39. `prevBlank` and `firstLine`
are 15-occurrence populations, which is the C2 trap. `textBeforeLabel` and `parent=paragraph`
are noise, and the paragraph row covers 99% of the positions so it cannot discriminate anything
by construction. `parent=heading` at 0 of 17 is the one clean signal and we already agree there.

So `probe:i1` is narrowed three ways and is NOT one mechanism: not a threshold (D4 is 7/7), not
an interrupt (2.0%), and not separable by any axis the tree exposes. Its 40 documents want
individual treatment or a feature neither side records — which is the same conclusion this file
reaches for the `code`-covers-a-position family and for `def-end+1`.

The CONSOLIDATION stands even though the attribution did not: `probe:i1` owns `probe:g4` and
`probe:h2`'s ordered half, so its population is 40 rather than the 14 it shows on its own. What
changed is the cause — this paragraph used to read "all 40 are the content-column and
code-threshold decision, which is B2's table", written before D4 was checked, and that is now
refuted from three directions. The remaining two `probe:h2` rows are the opposite direction —
obs reports a REFERENCE where we report nothing — and are a different question.

The 21 classified by which of OUR root nodes covers the label line: **9 paragraph · 8 list · 2
blockquote · 1 callout · 1 root**. And over the whole 40, **10 of the label lines are QUOTED**
(`> [^x]: …`), so a quarter of the family is blockquote-hosted whatever the indent says.

**A `%%` signal in this family is NOT real, and its base rate is why.** A stride sample over the
21 shows `%%` on the label line or the line above it repeatedly — `commodo dolor %%`, `> %%`,
`> [^ä]: Prose here %% [^3] %%` — which reads as a comment family and nearly bought a correction
to the paragraph above. Measured:

|                  |                     |
| ---------------- | ------------------- |
| corpus base rate | 2,119/6,818 = 31.1% |
| this family      | 14/40 = 35.0%       |
| **lift**         | **1.13x**           |

Inside the noise band this file already records refusals at (1.24 and 1.25, with 1.45 the
strongest in a whole table), so the `%%` is the generator rather than the cause and the B2
reading stands. Sixth counting selector to die on a base rate here, and the first where the
count came from a sampler this file mandates — `strideSample` protects against reading the
SHORTEST members, not against reading a coincidence.

**`P1`/`P2` are Obsidian CACHE BUGS, and our answer is the right one — do not chase them.** The
cache reports a column as if a `%%` opener's indentation were absent (P1), and shifts the line
under a callout title by the outer container's width when the callout is nested (P2). The
document is explicit that their reader also keeps the true column and the referee lists a
representative as a known disagreement. We have no such record, so `night:p2b-task-sp-co-quoted`
counts against us at 6208 while being correct: obs column 8, ours 6, and 6 is right. Reproducing
it would violate the standing rule that this is not "match Obsidian including every bug".

## The two external issue lists, swept 25 of 25 — six divergences, none buildable yet

`~/Repos/obsidian-parser-issues-summary.md` (another plugin author, 25 numbered items against
1.14.5) and `~/Repos/obsidian-parser-issues-gaps.md` (our reply, 27 additions). Every concrete
case was run through both presets. **Nineteen are already correct** — legacy reproduces the
reading view and strict follows CommonMark — including every item in their section B
(`===marked===`, `%%open`, `$$5`, a code span over a line break, math in a link label, `$b$`
over `---`, a quoted task, a quoted fence) and the list and entity items 23 and 26.

**D4's threshold table reproduces 7 of 7**, which is the result that matters for targeting:

```
⟨4sp⟩ defines   ⟨5sp⟩ defines   ⟨6sp⟩ CODE
⇥     defines   ⇥⟨3sp⟩ defines  ⇥⟨4sp⟩ CODE   ⇥⇥ CODE
```

So the 40-document B2 family is NOT a missing threshold rule — the isolated arithmetic is
already right, and the defect is the dense-document interaction, exactly as recorded.

Six genuine divergences, with the corpus exposure that decides what to do about them:

| #   | case                      | Obsidian                      | ours                   |   exposure |
| --- | ------------------------- | ----------------------------- | ---------------------- | ---------: |
| 27a | `<MAILTO:FOO@BAR.BAZ>`    | text, scheme DROPPED, no link | a link                 |      **1** |
| 27c | `<foo\+@bar.example.com>` | text, keeps the `\`           | a link                 |      **0** |
| 18a | `[ a ]` with `[a]: /url`  | stays text                    | `linkReference`        |      **0** |
| 24  | blank in a nested item    | whole OUTER list loose        | CommonMark [307]/[318] |      **0** |
| 20  | `![foo *bar* ...](x)`     | alt keeps raw markup          | alt collapsed          | projection |
| 25  | unclosed fence at EOF     | a trailing empty line         | `code("aaa")`          |  rendering |

**None of them is buildable against this corpus, and that is the finding.** 27c, 18a and 24
have ZERO documents exercising the rule, so any measurement over the corpus would come back
clean while proving nothing — the failure mode this file already records costing a shipped
regression. 27a has one document, below the bar that refused C2 at two. 20 and 25 are
projection and rendering concerns, the same class as C2's `data-heading`.

Two of the zeroes were measured rather than assumed, and both needed the precise predicate
rather than the obvious one: `[ x ]` appears in 132 documents and **none** produces a padded
`linkReference` label, because a padded label only forms when a matching definition exists;
and 1,315 documents hold a nested list while **zero** hold the outer-tight/inner-loose shape
item 24 is about — a count whose detector was control-verified on a known positive first,
since this file treats a zero as suspect by default.

So these want recorded probes against the application before any of them can be scored, which
is the documented route (settle with `ask.mts`, then promote the shapes into `corpus.ts`). They
are NOT leads for the referee queue. Their authors' own section-A items 01, 02 and 03, and the
gaps file's B1/B2/B3/B5, are flagged must-not-fix-by-matching on both sides — consistent with
the P1/P2 policy above.

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
