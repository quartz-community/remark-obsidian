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
| `regressions.mts`    | which documents WE break that stock already gets right                     | organised by BLAME, not by rule; `--self-test` validates its restated agreement test against the referee's own count     |
| `ask.mts`            | the live Obsidian oracle                                                   | see below                                                                                                                |

### The blame-ordered sweep: 22 documents we break that stock gets right

Every other instrument here is organised by OBSIDIAN RULE, so a divergence this package
introduced itself is invisible to all of them — it belongs to no family, because no Obsidian
rule is missing. `regressions.mts` is organised by BLAME instead, and the population it finds
had never been measured:

|                                            |        |
| ------------------------------------------ | -----: |
| documents                                  |  6,818 |
| ours agree — **the control**               |  6,252 |
| stock `remark-parse` + `remark-gfm`        |    960 |
| **SELF-INFLICTED** stock agrees, we do not | **22** |
| we add value — we agree, stock does not    |  5,314 |

**The control is what makes the 22 trustworthy.** Stock has to be projected through the same
test the referee applies to us, and there is no way to do that without restating `same`/`named`
— which has disagreed with the oracle four times in this effort. So `--self-test` asserts that
the restated test, applied to OUR facts, reproduces the referee's own agreeing count. Two
details it turns on, both of which have already cost a wrong answer: `named()` drops
empty-named rows and the compare is an ORDERED `JSON.stringify` (not a set, not a sort), and a
`Def` is a **four**-tuple, so comparing name/line/column silently ignores its fourth field.

Stood down across all 97 call sites, **19 of the 23 found were transform-owned and 4 are
parse-phase** — those four survive with every transform disabled, so they belong to our
micromark syntax extensions rather than to any pass. The attribution:

|     | pass                                                                                      |
| --: | ----------------------------------------------------------------------------------------- |
|   7 | `bareFootnoteRefTransform` — one shipped (`1d64745`), 6 left                              |
|   4 | `footnoteInterruptTransform` — **refused, see below**                                     |
|   2 | `definitionColumnTransform`                                                               |
|   1 | each of `commentDefinitionExtent`, `commentParse`, `definitionTabPastItem`, `lrdFootnote` |
|   2 | jointly owned — no single pass, so they need a PAIR probe                                 |

**`bareFootnoteRefTransform`'s 7 are four unrelated shapes, and only one reproduces minimally.**
A reference in a code span, in an autolink, on a 4–6 space indented line, and in a doubly-quoted
line. Probed in isolation, the code span, the indented line and the quoted line are all CORRECT
— so their corpus documents have some other cause and the shape is not the mechanism. Only the
autolink reproduced on its own, and it shipped.

**`footnoteInterruptTransform`'s 4 are REFUSED after three materially different discriminators.**
All four are one shape — an unclosed-looking fence in a list item, then a dedented label that
Obsidian (and stock) define and we fold into the paragraph as a bare reference:

| discriminator                                | gain / break |
| -------------------------------------------- | -----------: |
| the label is DEDENTED below its host         |  8 / **307** |
| the host paragraph follows any `code`        |  5 / **127** |
| the host paragraph follows an UNCLOSED fence |    **0** / 4 |

The first two say the fold is overwhelmingly right in exactly those conditions — lazy
continuation dominates. The third does not even reach the targets, and the reason is the useful
part: in `1.⟨6sp⟩~~~` our parse produces `code@1:4`, an INDENTED code block, not a fence at all,
so a fence predicate can never fire there. Whatever owns these four is upstream of the fold, in
how that line becomes code.

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

### The root-`code` dimension, and why nothing in the queue points at it

`referee.mts` reports it separately from the footnote figure — 883 documents carry an obs root
code range, 845 agree, and the largest failing kind was **23 "we report NO root code block"**,
now 20. Because it is a separate dimension, no named family describes it and the queue cannot
reach it, which is how a four-document rule sat unqueued.

Classified by what covers obs's first code line in OUR tree:

|     |                                    |
| --: | ---------------------------------- |
|  13 | list-hosted                        |
|   3 | root `math`                        |
|   3 | root paragraph                     |
|   3 | inside a root `footnoteDefinition` |
|   1 | quoted                             |

The `footnoteDefinition` trio gave its rule away by NAME —
`pin:bug-scan-setext-label-indented-chunk#1..3` — and it shipped in `8c20386` at 4 gain / 0
break. `setextDefinitionTransform` already owned the rule and was under-firing: it required the
definition's slice to be exactly two lines, so `[^1]: x` / `===` / `⟨4sp⟩chunk` never matched,
the indented line being absorbed as continuation.

**Two checks before building, either of which would have wasted the work.** `pin:bug` is NOT a
must-not-fix class — all 87 of its rows carry `refsTrustworthy: true`, so they are pinned
regression cases rather than Obsidian defects like P1/P2, which matters because matching a cache
bug is forbidden here and the family name reads exactly like one. And **E4 is not the
mechanism**, which is where this started: the three documents put 12–20 characters before obs's
code line, far inside the 1,024-character ender window, so the definition is not ending for
want of window — it ends because `===` underlines its label.

A fourth document came with them that no measurement predicted. The predicate scored 3 fires at
3 gain / 0 break and the referee moved 4, which is the position-versus-document distinction
again — and the first time in this effort it ran in the generous direction.

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

**SETTLED against the live oracle, with a control pair.** Probed with real definitions supplied,
which is how `footnoteRefs` can be read at all, since it is definition-gated:

| document                   | obs `footnoteRefs`       |                         |
| -------------------------- | ------------------------ | ----------------------- |
| `a^[x %% [^1] %% y] w[^2]` | `[["2",0,20]]`           | `[^1]` DEAD             |
| `a^[x [^1] y] w[^2]`       | `[["2",0,14]]`           | DEAD — control, no `%%` |
| `a %% [^1] %% y[^2]`       | `[["1",0,5],["2",0,14]]` | **LIVE** — `%%` alone   |

So inline-footnote inertness WINS and the `%%` rule applies only outside one. The precedence is
no longer a hypothesis.

**And its population is ONE, which only the tree could say.** A bracket-counting scan over the
source reported 76 positions at 10 gain / 66 break — its depth counter decremented on `[^1]`'s
own `]`, closing the span early. Asked of the tree instead, as a `footnoteReference` with a
`footnote` ancestor, there is exactly **1** such position in 6,818 documents and it is this
document: 1 gain / 0 break. Fifth hand-rolled span predicate to come back contaminated against a
tree-derived answer, after D1 twice, the paragraph-interrupt scan and the label scan.

**Two of the external gaps are confirmed NOT adjudicable by `metadataCache`**, recorded so they
are not probed again. Item 24 needs list spread, and `listItems` carries only `(line, parent)`:
`- a` / `  - b` / blank / `  - c` reports `[[0,-1],[1,0],[3,0]]`, which is our structure exactly
and says nothing about looseness. Item 18a needs to know whether `[ a ]` became a link, and
`links` holds internal links only — `[ a ]` with `[a]: /url` reports
`sections: [paragraph, definition]` either way. Both are DOM questions, so only the recorder can
settle them.

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
  root definition. We already decline the table (correctly): our tree is ONE paragraph spanning
  all three lines, so the tab line is a lazy continuation and the label degrades to text. The
  repair therefore needs the tab line to END the paragraph — **and that is refused at 1.5%**:
  over the 66 places where our root paragraph lazily continues a tab or 4-space line, obs
  reports a root code range at **1** and does not at **65** (51 four-space, 14 tab). Obsidian
  does not generally make such a line code, so group A's mechanism is narrower than "the tab
  ends the block".
- **B** is C2 verbatim, including its worked example: in a PIPELESS table a row "does not start
  with a pipe", so an indented `| c[^2] | d` is still a row and the reference is live. We read
  it as indented code and lose it. **SHIPPED in `8257a6a`** as `tablePipelessRowTransform`,
  gated on `legacyTables` because GFM really does read that line as code, and placed beside
  `tableIndentedRowTransform` — its converse, since an indented row ENDS a piped table and
  CONTINUES a pipeless one. Corpus-wide it fires on 8 positions, not the 2 recorded, and all 5
  of its position-gains have the line under a `code` LEAF (twice `root > code`, three times
  `root > list > listItem > code`), so one sibling-level repair reaches every host. The row is
  rebuilt by re-parsing the table's own first two lines with the de-indented row appended;
  re-parsing the whole table slice cannot work, because a quoted table's node starts after the
  `>` and the slice's later lines keep a `>` the reparse then refuses to read as rows.

  **Its remainder is 0, not the 3 that commit claimed, and the correction is a contaminated
  predicate of mine.** The pipeless test read `trimStart()` of the raw header line, which leaves
  a QUOTE MARKER in place — so `   > | हिंदी है | b` counted as pipeless when it is a piped
  table inside a quote, and C2 never applied to it. Re-tested prefix-immune, from the character
  at the table node's own start offset, 6 raw matches drop to 1. Of the three "list-hosted
  remainders", two are piped tables and one real position survives, in a document carrying
  unrelated `ref-EXTRA` and `def-EXTRA` divergences thirty lines later — so it cannot flip on
  this oracle whatever the pass does. A synthetic-scaffolding refactor to reach it measured
  **INERT** and was reverted.

  Two rules this cost. A `trimStart()` pipeless test is wrong wherever a container prefix can
  precede the table; ask the TREE for the opener. And **a position-level gain is not a
  document-level gain** — C2's "5 gains" were positions, only 2 sat in documents that could
  reach agreement, and predicting +1 from the third confused the two.

- **C** is the inverse, in a quote, and over-indexes.

**And group B is one of SEVEN correct rules this session that break nothing**, which is a
pattern rather than a coincidence. Every named family has now been measured as a predicate over
all 6,818 documents, and the ones that are not refuted all look like this:

| rule                                                    | gain / break | fires |
| ------------------------------------------------------- | -----------: | ----: |
| **D2** frontmatter needs an exact `---`                 |        2 / 0 |    11 |
| **E2** a 4-space label continues a definition           |        2 / 0 |     2 |
| **C2** an indented row in a pipeless table              |        2 / 0 |     2 |
| **`night:ct`** a tab-led callout title is dead          |        2 / 0 |     2 |
| **`probe:b2`** a two-tab nested marker defines at col 4 |        2 / 0 |    27 |
| **`probe:e3`** inline-footnote inertness beats `%%`     |        1 / 0 |     1 |
| **`probe:c1`** a ref in an indented table row is live   |        1 / 0 |     4 |

All seven are fully specified in the upstream rules document or settled against the live oracle,
all seven fire on a handful of positions, and **none breaks a single document**. Individually
each sits below the bar this file sets — "read `better + worse + same` first, and a total that
small does not justify the pass however the sign comes out", the standard that refused the `C2`
CANDIDATE at two documents. Collectively they are **12 documents of zero-risk correctness across
seven unrelated passes**.

**Consolidating two of them into one pass was tried and FAILED ON THE PREDICATE, and the
near-miss is the reason to record it.** `C2` and `probe:c1` are both "an indented pipe-row keeps
its reference live", so one pass covering both would clear the per-pass bar where neither does
alone. A line scan for an indented row holding a pipe and a `[^x]` reported 114 firing positions
and, at document level, **8 documents that would fully agree** — four times the largest N/0 rule
and an apparently decisive lead. Split four ways it collapses:

|                     |        |                                        |
| ------------------- | -----: | -------------------------------------- |
| both index          | **76** | the rule is a no-op                    |
| obs only → GAIN     | **15** |                                        |
| we only             |      3 | pre-existing, the rule changes nothing |
| **NEITHER → BREAK** | **20** | the rule would INVENT a reference      |

15 against 20 is 43%, and the losing rows say why: `⟨4sp⟩[^1.5]: sit … ![[image.png|…`,
`⟨4sp⟩[^4]: …[[Some note|alias]]`. They are DEFINITION LABEL lines whose pipe comes from a
wikilink alias or an embed, not from table syntax — `[^\n]*\|[^\n]*` accepts a pipe anywhere on
the line.

So the 8 documents were my predicate, not the rule, and the trustworthy figures remain the
tree-derived 2/0 and 1/0 above. **Sixth contaminated predicate of this effort, and the first to
err OPTIMISTICALLY** — the other five made a rule look worse or mis-sized, and this one
manufactured a lead. A loose predicate is not biased toward refusal; it is biased toward
whatever its false fires happen to contain.

**The deferral was then tested by building them, and it was wrong four times out of four.** The
arithmetic above treats "a new pass per rule" as the price, and three of the four rules attempted
did not cost that at all — each for a DIFFERENT reason, which is why measuring beat estimating:

| rule       | the verdict that deferred it      | what it actually cost                                          |
| ---------- | --------------------------------- | -------------------------------------------------------------- |
| `probe:e3` | needs a new late pass             | **re-ran an existing pass** — one line, `e7ce248`              |
| **18a**    | a correct one-case rule, too tiny | a new pass, which ALSO closed a round-trip entry (`b133c1f`)   |
| `probe:c1` | needs new pass surface            | **an existing pass was over-firing** — an exclusion, `58f5b1c` |
| **D2**     | the opener is third-party         | **no option and no block** — a third sibling, `2d8b93e`        |
| **E2**     | nests two defs upstream           | an un-nesting pass — **8 documents**, `83a7526`                |
| **C2**     | absorption machinery              | a new pass, 2 of its 5 — `8257a6a`                             |
| `probe:b2` | deep tab arithmetic, 2 refusals   | **an existing pass was over-firing** — an exclusion, `ed3bcf9` |

**All seven were attempted and all seven landed, at zero breakage.** Three needed no new surface
at all, and the two priced as hardest were the cheapest to fix. Two improved a ceiling no
measurement predicted: 18a closed `probe/label-shape/space-only-defined` out of the round-trip
unstable set, and D2 took the positioned-oracle divergences from 23 to 20.

**A FIGURE DERIVED FROM A NAMED FAMILY IS NOT A POPULATION.** The arithmetic that deferred these
("12 documents across seven passes") was built from family counts, and re-measuring each as a
corpus-wide predicate moved two of them by multiples:

| rule       | recorded | measured corpus-wide |
| ---------- | -------: | -------------------: |
| E2         |        2 |  **9** fires, 8 docs |
| C2         |        2 |  **8** fires, 5 gain |
| `probe:b2` |       27 |            27, exact |

So the deferral was priced on populations that had never been measured the way the rules were.
Re-derive before ranking, which is this file's own rule applied to its own table.

### The three diagnoses, and the one-run bisect that separates them

Comparing stock `remark-parse` + `remark-gfm` against every option tells you which kind of
problem you have, and it is the step that would have prevented all seven wrong verdicts:

| what the bisect shows                    | the repair                    | seen in                     |
| ---------------------------------------- | ----------------------------- | --------------------------- |
| an option moves it                       | an **exclusion** in that pass | `probe:c1` (`legacyTables`) |
| **nothing** moves it, stock is WRONG too | genuine **new surface**       | 18a, E2, C2                 |
| nothing moves it, **stock is RIGHT**     | we are **destroying** it      | `probe:b2`                  |
| stock and Obsidian AGREE against us      | **no option at all**          | D2                          |

**The third row is a category this file did not have, and it is the most valuable one.** For
`probe:b2`, stock produces the correct definition and we delete it — along with the item's
content, leaving a `listItem` with no children. A divergence where stock is RIGHT is not a
missing feature, it is a regression one of our own passes introduced, and the fix is an
exclusion rather than a tokenizer change. The record had it filed as "deep tab arithmetic, two
refusals already in that function", which is why it was ranked last of the seven.

**When a pass-ownership sweep reports NO OWNER, suspect the matcher before the conclusion.** The
sweep for `probe:b2` stood down 56 passes and found nothing — a clean "not a transform" that
would have sent the work straight into the tokenizer the record already blamed. Call sites in
`index.ts` sit at **three** indentation depths (39 at four spaces, 57 at six, 1 at eight, 97
total), and the matcher anchored only six. What caught it was a KNOWN-POSITIVE control: standing
down all 97 at once gives the stock answer, proving a transform was responsible before any
single pass was believed innocent. This file already records `0 of 57 passes own anything` from
an over-strict matcher — same failure, two weeks apart, and only the control distinguishes it
from a true negative.

**"Each would need a new pass" was an ASSUMPTION, and checking it changed one answer.** Two of
the seven turned out to be reachable without new surface, and the difference is in the REPAIR
rather than the rule:

| rule       | what our tree does                        | repair                                          |
| ---------- | ----------------------------------------- | ----------------------------------------------- |
| `probe:e3` | ref revived by a later pass               | **re-run an existing pass** — shipped `e7ce248` |
| `night:ct` | ref revived by `bareFootnoteRefs`         | needs a NEW late pass — refused                 |
| C2         | `table@1` + `code@3`                      | needs absorption machinery                      |
| D2         | `yaml@1`                                  | the opener is third-party; needs a post-pass    |
| E2         | `footnoteDefinition > footnoteDefinition` | **stock remark+gfm already yields 2 defs**      |
| `probe:b2` | nested list, no definition at all         | the tab arithmetic in the list reader           |

The E2 row is the one worth keeping. Our tree nests a second definition where Obsidian makes
none, which reads like a pass of ours to correct — and an options bisect says stock
`remark-parse` + `remark-gfm` produces the same two definitions with this package absent, and
no option moves it. So the nesting is upstream and un-nesting it is a repair pass, not a guard.

None of this changes the verdict, and that is the point of recording it: the claim was right and
had not been measured, in a file whose own rule is that an unverified blocker is not a blocker.
Three times this session an assumption of exactly this shape turned out false — Obsidian was
running, the P-rule cases were already pinned, and `night:ct` looked like `probe:e3`.

**The refuted half of the tail looks nothing like this, and the contrast is the finding.** The
same measurement applied to the families that are NOT correct-and-tiny:

| family                               | gain / break | we are already right |
| ------------------------------------ | -----------: | -------------------: |
| `probe:d5` `definition / %% / label` |       3 / 19 |             39 of 61 |
| `night:f5` indented `%%` buries      |       2 / 47 |             88 of 90 |

Both are comment-extent rules, both refute (14% and 4%), and in both we already agree with
Obsidian on roughly 95% of the firing positions. So the two-document failures in those families
are a TAIL on behaviour that is already correct, not a missing rule — which is the same verdict
`probe:i1` got from three directions, and it is why neither is worth a pass however small.

**`night:ct` also shows what the narrowing is worth, which the other three did not.** Stated
loosely — any tab in the title separator — it scores 2 gain / **33 break**, because a SINGLE
tab separator behaves exactly like a single space and Obsidian indexes both:

```
> [!note] Title[^1]     indexed       > [!note]⇥⇥Title[^1]    DEAD
> [!note]⇥Title[^1]     indexed       > [!note] ⇥Title[^1]    DEAD
> [!note]  Title[^1]    indexed
```

The discriminator is that the title CONTENT begins with a tab, after `MARKER` has consumed its
one optional `[ \t]`. Stated that way it is 2 / 0. So the same rule is a 5.7% mess or perfect
depending on where the boundary is drawn, and the probe table above is what located it — not
the losses, which is the distinction between narrowing and fitting.

**And it is REFUSED on implementation rather than on size, which is a different reason from the
other six.** Demoting the title's reference inside `calloutTransform` measures INERT, and an
options bisect says why in one run:

|                          |            |
| ------------------------ | ---------: |
| default                  |      1 ref |
| `bareFootnoteRefs:false` | **0 refs** |
| `keepComments:false`     |      1 ref |
| `taskReparse:false`      |      1 ref |

`calloutTransform` runs early, turns the reference into literal `[^1]` text, and
`bareFootnoteRefTransform` at `index.ts:1074` then scans text nodes and rebuilds it. The same
circular revival as `probe:e3` — and that is where the two part company. `probe:e3` was fixable
by RE-RUNNING an existing pass under its existing option after the reviver (`e7ce248`, one
line). This one has no existing late pass to re-run, so it needs NEW SURFACE at a late position,
and new surface for two documents is exactly what the bar refuses. Reverted rather than shipped
inert.

So "a fix to an existing pass is not new pass surface" is the right test, and it has to be
applied to the REPAIR rather than to the rule: both of these are corrections to existing
grammars, and only one of them can be made without adding a pass.

What the pattern says is about the EFFORT rather than the rules: after the referee's large
families have been mined out, what remains is a tail of exactly-specified two-document rules.
That is a different problem from the one the queue was built for, and it is the same conclusion
the six external-list gaps reach from the other direction — the analysis is finished and the
oracle's resolution is the limit.

So the family is not one rule but three clauses of two rules, each with a written answer and
2–3 documents behind it. Worth noting that it is the same arithmetic as `legacyTables` and the
C1 refinement of 2026-10-03 ("the first-character test replaced 'after any spaces'", 45 notes
of that run) — so the pipe-style half is already implemented and it is the TAB and INDENT
interaction that diverges.

### D2's opener is measured, scoped, and SHIPPED for the space form

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

**Its structural half is now SETTLED against the live oracle, and it is no longer blocked.**
Obsidian 1.15.0 was running, so `ask.mts` could answer it directly — and `release-diff.mts`
having measured 1.15.0 as moving nothing across all 3,417 documents is what makes that answer
usable against goldens pinned at 1.14.4:

| document                        | obs `sections`                        | ours   |
| ------------------------------- | ------------------------------------- | ------ |
| `--- ` / `title: x[^1]` / `---` | `thematicBreak@0` + **`heading@1-2`** | `yaml` |
| `---` / `title: x[^1]` / `---`  | `yaml@0-2`, frontmatter read          | `yaml` |
| `---⇥` / `title: x[^1]` / `---` | `paragraph@0-1` + `thematicBreak@2`   | `yaml` |

The space form is exactly what this file predicted: a thematic break, then a setext H2 whose
text is `title: x[^1]` at level 2, carrying a live reference. **The tab form is not**, and that
is the new fact — `---⇥` is not even a thematic break, so lines 0 and 1 become one paragraph and
the closing `---` is a thematic break rather than a setext underline. CommonMark allows trailing
tabs on a thematic break, so that is a second, separate divergence sitting underneath D2.

Both spellings confirm the rule that matters: **neither opens frontmatter**, and we answer
`yaml` for both.

**The space form SHIPPED in `2d8b93e`, and it needed neither an option nor a new block.** The
bisect asked which side of the legacy/strict split it falls on and the answer is neither —
`yaml=1` under every option including `preset: "strict"`, against `yaml=0` for stock, because
`--- ` is an ordinary thematic break in CommonMark too. Obsidian and CommonMark AGREE here, so
there is nothing to gate, and `frontmatterExactOpenerTransform` joined the existing
`if (opts.frontmatter)` block as a third sibling to the two passes already correcting this
extension's closing-fence defects.

    referee 6238 -> 6239, 1 gained 0 lost
    positioned-oracle divergences 23 -> 20
    ceilings  frontmatterPosition 2 -> 1   headings 1 -> 0   sections 3 -> 2

The repair uses the extension's own precondition: frontmatter opens only at offset 0, so
re-parsing the block behind a prepended blank line suppresses it without vendoring the construct
or taking a new name. One line and one offset are rewound afterwards.

**The TAB form is still open and must not be shipped on this machinery.** The same reparse gives
`list + heading2` for `---⇥`, where the oracle says `paragraph + thematicBreak` — so it would
replace one wrong answer with another. The third of the three disagreeing documents,
`broad-20261004.json#323`, is now correct at its first line (`thematicBreak@1 heading2@2`) and
fails on `def-MISS 1@25@8 ä@27@8` thirty lines later, an unrelated mechanism.

**And item 25 is refuted as a parse gap by the same run.** An unclosed fence at EOF gives obs
`code@0-2`, byte-identical to the closed form and to ours — so the summary's "a trailing empty
line" is a rendering artifact, not a parse difference. One of the six external gaps closes on a
measurement rather than a build.

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

### The `definition / %% / label` shape is already 95% right, so `probe:d5` is a tail

`comment-definition-extent.ts`'s docstring records the oracle answers for this shape and names
the rule — "`> [^9]: orphan` makes the `%%` a CONTINUATION of that definition", so the label
below it still defines — with `probe:d5`'s two failures as the worked example. Reading that as a
rule to build is the trap. Measured over every occurrence:

|                                           |        |
| ----------------------------------------- | -----: |
| `definition` / `%%` / `label` occurrences | **61** |
| obs defines and we do not — would GAIN    |  **3** |
| neither defines — would BREAK             | **19** |
| we already define it — no change          | **39** |

So obs defines in 42 of 61 and buries in 19, and we already agree on 58 of them. Making the `%%`
a continuation unconditionally scores 3 / 19, which is 14% — the fourth refutation of this shape
this session. The `%%` sometimes buries and sometimes does not, and what decides it is not in
the three lines the shape names.

**And the first version of this measurement was wrong in the direction that flatters the rule.**
It built our-definition keys from the NAME in obs's answer, which is the empty string wherever
obs has no definition, so the key never matched and every non-defining occurrence counted as a
break — 22 fires and 19 breaks, with the 39 we already get right invisible. Position-only sets
give 61/3/19/39. Both runs refuse the rule; only the second shows we are already right 95% of
the time, which is the part that matters for whether to touch it at all.

### Three of the five unqueued families are P1/P2, so the 68 overstates the defect count

Characterising the five families the count sweep found unqueued (11 documents) turned up fewer
defects than documents, because the cache bugs are mixed in with them:

| document                      | shape                              |  obs | ours | verdict                                     |
| ----------------------------- | ---------------------------------- | ---: | ---: | ------------------------------------------- |
| `night:cs-pct-sp-ref`         | `%% a[^1]`                         |    2 |    4 | **P1 — ours is right**                      |
| `night:cs-ord-co-lazy-text`   | `1. > [!note] T` / `ab cd[^1]`     |    8 |    5 | **P2 — ours is right**                      |
| `night:p2b-task-sp-co-quoted` | `- [ ] > [!note] T` / `  > ab[^1]` |    8 |    6 | **P2 — already recorded**                   |
| `night:p2-item-space-title`   | `- > [!note] ` / `  > ab[^1]`      |    — | none | the unplaced-node bug (`f1ef3b1`)           |
| `night:cs-co-tab-lazy`        | `> [!note]⇥ ` / `[^1]`             |    0 | none | a genuine miss, same shape                  |
| `night:ct-*` (2)              | `> [!note]⇥⇥Title[^1]`             | none |   16 | we over-index a tab-separated title         |
| `night:k1463-*` (2)           | nested `%%` + definition           |      |      | the F5 family, already queued as `night:f5` |

So of 11 documents: **3 are P1/P2 where our answer is correct and must not be fixed**, 2 are the
already-recorded unplaced-node bug, 2 are the F5 family already queued elsewhere, and only the
2 `night:ct` rows are a new question.

**That means the 68-document total across the 21 named families overstates the work.** It counts
every document where the referee disagrees, including the ones this package diverges from
Obsidian on PURPOSE.

**The CORPUS-side instruments already mark these; the referee cannot, and should not.** Checked
rather than assumed, because this file previously claimed nothing marked them at all:
`compute.test.ts`'s `KNOWN_REFERENCE_GAPS` carries two P1 entries with their reasoning, and
`rules-doc.test.ts` carries the P2 column quirk under a comment that states the standard exactly
— "NOT OURS, and MUST NOT REACH ZERO … We report 5 and are right, so this entry keeps the set
exact rather than recording a debt". So a future fix toward Obsidian's cache bug fails a gate on
the corpus side.

The referee side is different by construction: its corpus belongs to a sibling project and is
not vendored, so there is nowhere in this repo to record an exclusion for it. Adding one would
mean editing a measurement because it disagrees with us, which this harness refuses elsewhere in
exactly these words — "do not reach for the measurement when the measurement is what disagrees
with you". So the referee's total legitimately counts 3 documents against us that we are right
about, and reading it correctly is a matter of knowing that rather than of changing the tool.

**`P1`/`P2` are Obsidian CACHE BUGS, and our answer is the right one — do not chase them.** The
cache reports a column as if a `%%` opener's indentation were absent (P1), and shifts the line
under a callout title by the outer container's width when the callout is nested (P2). The
document is explicit that their reader also keeps the true column and the referee lists a
representative as a known disagreement. We have no such record, so `night:p2b-task-sp-co-quoted`
counts against us at 6208 while being correct: obs column 8, ours 6, and 6 is right. Reproducing
it would violate the standing rule that this is not "match Obsidian including every bug".

## The queue tracked 12% of the remaining work, and 69% of it has no rule name

Re-derived rather than read: every corpus id's family prefix recomputed against the current
tree, with the agreement test validated against the referee's own count first (6,252 of 6,818).

|                                                       |               |
| ----------------------------------------------------- | ------------: |
| failing documents                                     |       **566** |
| in `fuzz:` and `broad:` — **generated, no rule name** | **391** (69%) |
| in named rule families                                |           175 |
| tracked by the queue below                            |           ~68 |

**So the named-family queue, which this file treats as the backlog, covers an eighth of what is
left.** Its families are real and its characterisations hold, but the bulk of the remaining
disagreement sits in two generated corpora that no family describes, and nothing in this record
had ever counted them. A figure derived from the queue is not a figure about the corpus.

**The family key must split on `-` OR `|`, whichever comes first.** Ids come in both shapes —
`probe:a-bare-label` and `probe:i1|dash4|t1s1` — so a `-`-only key scatters `probe:i1` across 14
families of one document each and hides it from any ranking. That is how `probe:i1` first
appeared as "14 × 1 of 1" rather than "14 of 270".

Families this record had never mentioned, found by the same sweep: `pin:bug` 5 of 87,
`swap34:lrd` 4 of 5, `fact:0e4bb64` 3 of 9, `fact:94f830b` and `fact:c206eae` 2 each, about ten
more `fact:*` singletons, `probe:g1`, `probe:g2`, `probe:i2`, `probe:j1`, `probe:j2`,
`probe:rv:g4`, `night:d1b`, `night:d1c`, `night:d2c`, `night:d2o`, `night:p2b`, `pin:spec`.

**`swap34:lrd` was the highest FAILURE RATE in the corpus at 4 of 5 — 80% — and it is D6**,
which this file already lists as a known divergence without a population. A small family failing
nearly everything is a missing rule rather than a tail, so rate is worth ranking by and not only
count. Shipped in `0323f48` at 3 gain / 0 break; the fifth case is a different shape.

### The largest remaining mechanism is definition EXTENT, at 95 documents

Classifying all 559 failures by error signature — not by family — turns up a bucket no family
tracks and no earlier count had isolated:

|     | signature              | generated |
| --: | ---------------------- | --------: |
| 110 | `ref-EXTRA`            |        81 |
|  96 | **extent only**        |    **82** |
|  92 | `ref-MISS`             |        67 |
|  73 | `def-MISS`             |        46 |
|  45 | `def-EXTRA + ref-MISS` |        32 |
|  38 | `def-MISS + ref-EXTRA` |        12 |
|  38 | `def-MISS + def-EXTRA` |        20 |
|  26 | `def-EXTRA`            |        20 |

**"Extent only" means every definition and every reference is at exactly the right position and
the document still disagrees.** A `Def` is a four-tuple and the fourth field is the definition's
END LINE, so these differ on span alone. Split, it is unambiguous:

|                  |        |
| ---------------- | -----: |
| ORDER differs    |  **0** |
| END LINE differs | **95** |

Ordering is never the problem, which rules out the cheaper of the two explanations. 60 end LATE
(we run past Obsidian) and 37 end EARLY, across eight deltas in both directions — so no constant
offset, the same conclusion the earlier `def-col` work reached about columns.

By what sits at the boundary:

|     | we end LATE — the first line obs EXCLUDED but we kept |
| --: | ----------------------------------------------------- |
|  29 | **indented 4+**                                       |
|  19 | blank                                                 |
|   6 | col-0 text                                            |
|   4 | quote                                                 |

|     | we end EARLY — the first line obs KEPT but we dropped |
| --: | ----------------------------------------------------- |
|  18 | **quote**                                             |
|  10 | indented 4+                                           |
|   3 | blank                                                 |

So two shapes carry half of it: a 4-space-indented line we absorb and Obsidian does not (29),
and a quoted line Obsidian absorbs and we do not (18). That the SAME shape appears on both sides
— `indented 4+` at 29 late and 10 early — says the rule is conditional rather than a threshold,
which is why D4's isolated arithmetic reproduces 7 of 7 while the dense documents diverge.

**This is the `def-span` family, which this file carries as "the −41/−292 measurements stand but
their mechanism is unknown".** It is now sized and shaped: 95 documents, 17% of everything
remaining, and the largest single mechanism in the corpus — bigger than every named family put
together. It is also the cheapest to verify, because nothing else about these documents is
wrong.

## The named-family queue is fully characterised, and every member is 1–3 documents

Swept all 21 families for current counts, then characterised every one. The table is the state
of the backlog; "40-family" means the signature obs-defines-at-P / we-emit-only-a-bare-ref-at-P,
which `probe:i1` owns and which is refuted three ways above.

| family        | now | what it is                                                            |
| ------------- | --: | --------------------------------------------------------------------- |
| `probe:i1`    |  14 | the 40-family; not a threshold, not an interrupt, not separable       |
| `night:c6`    |   9 | group A refuted 1.5%; group B **part-shipped `8257a6a`**, 3 left      |
| `probe:f2`    |   6 | `%%` closer outside its container; production refused, 4 gates        |
| `probe:h2`    |   4 | 2 are the 40-family, 2 run the opposite way                           |
| `probe:g4`    |   3 | the 40-family                                                         |
| `probe:e2`    |   0 | **closed by `83a7526`** — 8 documents, not the 2 recorded             |
| `night:d1`    |   3 | D1 refuted at 5/37 with the span derived correctly                    |
| `night:d2`    |   2 | space opener **shipped `2d8b93e`**; the TAB form is a 2nd rule        |
| `night:cs`    |   2 | both are P1/P2 CACHE BUGS; **our answer is right**                    |
| `night:ct`    |   2 | measured 2/0 — correct, too small                                     |
| `night:f5`    |   2 | obs buries a definition we make                                       |
| `night:k1463` |   2 | obs indexes a reference we lack                                       |
| `probe:d5`    |   2 | a tail on a shape we are already right about 95% of the time          |
| `probe:b2`    |   0 | **closed by `ed3bcf9`** — stock was right and a pass of ours broke it |
| `probe:c5`    |   2 | 1 is the 40-family, 1 is a column difference (obs 2, ours 0)          |
| `probe:c1`    |   0 | **closed by `58f5b1c`** — an existing pass was over-firing            |
| `probe:h3`    |   1 | remainder after `d3b4bb9`                                             |
| `probe:e3`    |   1 | a rule CONFLICT: E3 inertness vs a reference inside `%%`              |
| `night:p2`    |   1 | the P2 cache bug; **our answer is right**                             |
| `h2:rg2`      |   1 | D6, the title absorbing across a blank                                |
| `probe:a`     |   0 | closed by `f7597a3` and `0e775bb`                                     |

Three readings of that table that are not obvious from any single row:

- **The largest family is refuted, not open.** `probe:i1` and the three families that feed it
  (`probe:g4`, half of `probe:h2`, one of `probe:c5`) are one signature, narrowed three ways and
  separable by no axis the tree exposes. That is ~20 of the ~60 remaining documents.
- **At least 3 are must-not-fix** — `night:cs` ×2 and `night:p2` — where the referee counts us
  wrong and we are right. The corpus-side gates already pin this class (`KNOWN_REFERENCE_GAPS`
  for P1, `rules-doc.test.ts`'s P2 entry); the referee cannot, since its corpus is not vendored.
- **Four are correct rules worth exactly two documents each** (D2, E2, C2, `night:ct`), all
  measured at N/0, all below the per-pass bar.

So the backlog is not a list of unsolved problems. It is one refuted signature, a handful of
must-not-fix cache bugs, four correct-but-tiny rules, and a dozen one-document questions. The
analysis is finished; what is missing is oracle resolution, which is what the gap list below
reaches from the other direction.

### `night:k1463` is two unrelated singletons, and the column dimension is 99.2% agreed

The last family to be characterised, and it is not a family:

```
1. p / ⟨2sp⟩10. %% / ⟨6sp⟩x / ⟨4sp⟩[^1]: def / ⟨4sp⟩%%
   obs d[] r[1@3@4 …]     ours d[] r[…]        we LACK the buried label's reference

1. p / ⟨2sp⟩10.⟨5sp⟩%% / ⟨10sp⟩x / ⟨4sp⟩[^1]: def / ⟨3sp⟩%%
   obs d[1@3@4]           ours d[1@3@3]        a COLUMN off by one
```

The first is the failed-label-becomes-a-reference asymmetry not firing inside a nested comment.
The second is a column, and it is worth asking whether that is systematic. Measured over every
definition where both sides agree on name and line:

|                                       |           |
| ------------------------------------- | --------: |
| definitions agreeing on name and line | **5,112** |
| of those, the COLUMN differs          |    **42** |

So the column dimension is **99.2% agreed**, and the 42 are not one off-by-one. They spread
across seven deltas in BOTH directions — `+2` ×16, `+1` ×9, `+3` ×7, `+4` ×5, `-3` ×3, `-1` ×1,
`-2` ×1 — with a tab or a quote prefix in nearly every positive one (`⇥⟨2sp⟩[^4]:` reports 3
against our 1; `⇥⟨4sp⟩[^Ä]:` reports 5 against our 1). A constant offset is ruled out by the
sign change alone, which is the same conclusion the earlier `def-col` work reached from a
smaller sample.

### And classified by WHAT DIFFERS, the 66 are two mirror images plus a clean must-not-fix bucket

Grouping the same documents by error signature rather than by family — the selector this file
records as the one that works, since four text-shaped selectors died:

|     | signature              | families                                                             |
| --: | ---------------------- | -------------------------------------------------------------------- |
|  12 | `def-EXTRA + ref-MISS` | `night:c6`, `night:f5`, `probe:e2`, `probe:f2`                       |
|  11 | `def-MISS + ref-EXTRA` | `night:c6`, `probe:c5`, `probe:d5`, `probe:g4`, `probe:h2`           |
|  11 | `def-MISS`             | `probe:b2`, `probe:i1`                                               |
|  10 | `ref-EXTRA`            | `h2:rg2`, `night:c6`, `night:ct`, `night:d1`, `probe:e3`, `probe:h3` |
|   8 | `def-MISS + def-EXTRA` | `night:d2`, `night:k1463`, `probe:c5`, `probe:i1`                    |
|   8 | `ref-MISS`             | `night:c6`, `night:d2`, `night:k1463`, `probe:c1`, `probe:h2`        |
|   3 | `ref-MISS + ref-EXTRA` | `night:cs`, `night:p2` — **the P1/P2 must-not-fix**                  |
|   2 | `def-MISS + ref-MISS`  | `probe:f2`                                                           |
|   1 | `def-EXTRA`            | `probe:e2`                                                           |

Three things this says that the family table cannot:

- **The two largest are MIRROR IMAGES, 23 of 66 together.** `def-MISS + ref-EXTRA` is the
  `probe:i1` signature — obs defines, we emit a bare reference — refuted three ways above.
  `def-EXTRA + ref-MISS` is its exact complement: we define where obs buries and indexes the
  label instead. Both directions of one swap, and both already have refusals against them
  (`item-comment-swallows-defs-and-refs` at 0/1, `drop-defs-in-comment` at 85/218).
- **The must-not-fix cases have their own signature.** `ref-MISS + ref-EXTRA` is 3 documents and
  is exactly `night:cs` ×2 plus `night:p2` — the P1/P2 column shifts where our answer is right.
  So the one bucket that must NOT be worked is cleanly separable by signature, which is a better
  guard than recognising each by hand against the P-rules.
- **Signatures cross families and families cross signatures.** `night:c6` appears in four rows
  and `probe:i1` in two, which is why both the family count and the signature count overstate
  the number of distinct mechanisms. Neither axis alone sizes the work.

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

### The recorder settled the rest: TWO real gaps, and 27a was never one

`nix develop -c parity-record` works; bare `npm run parity:record` does NOT, and the failure is
uninformative — `ECONNREFUSED` on the driver port, because the downloaded Obsidian binary needs
the `nix-ld` the flake wires up. The wrapper also picks a free display and tears down through a
trap. Use it, as the README says.

Two things that run produced before any probe was added. **1.14.5 is inert**: re-recording moved
the version stamp and `recordedAt` and NOTHING else across all 3,448 cases, so it is the second
release this effort has measured as changing nothing, after 1.15.0. And **the cached service
manifest is not what `latest` means** — reading `.obsidian-cache/obsidian-versions.json`
directly said the newest non-beta was 1.14.4, and the service refreshed it to 1.14.5 on the run.

With nine probes recorded, four of the six gaps close:

| #   | outcome                                                                                        |
| --- | ---------------------------------------------------------------------------------------------- |
| 20  | **matches** — an alt is an attribute, outside every projection                                 |
| 24  | **matches** — the html proves obs makes the outer list loose, but `spread` is in no projection |
| 27a | **never a gap** — `commonmark/autolinks/597` is `match`                                        |
| 27c | **never a gap** — `probe/autolink/email-escaped` is `match`                                    |
| 18a | **real**, now `replicate` — measured at ONE case, see below                                    |
| D2  | **real**, now `replicate` ×2                                                                   |

**18a is measured and joins the deferred five.** The rule is that Obsidian does not trim or
whitespace-collapse a link label, so `[ a ]` never matches `[a]: /url` and stays literal where
CommonMark pairs them. Scanned over all 3,457 corpus cases for a `linkReference` whose RAW
source label carries padding — three, and two of them are existing `match` cases:

| case                                            | triage      | obs `text`       |
| ----------------------------------------------- | ----------- | ---------------- |
| `probe/external-gap/padded-label-defined`       | `replicate` | `"[ a ]"`        |
| `commonmark/links/552` (`[\n ]`)                | **`match`** | `""`             |
| `probe/label-shape/space-only-defined` (`[^ ]`) | **`match`** | `"[^ ] [^ ]: x"` |

So a blanket "a padded label does not match" rule would break `commonmark/links/552`, where
Obsidian renders NOTHING and we already agree. The narrowing is to exclude a WHITESPACE-ONLY
label — `[\n ]` trims to empty and is a different rule, already owned by
`blank-label-reference.ts`, which gates on "a definition with that exact identifier existing".
Narrowed that way the rule is worth exactly ONE case.

**And it SHIPPED, which retires the "deferred on size" verdict for this class.**
`paddedLabelReferenceTransform` is a new pass gated on `legacyLinkDefinitions`, placed directly
after `blankLabelReferenceTransform` because that pass CREATES references and this one demotes
them — a demotion placed earlier is undone, the revival that measured `night:ct` inert.

    probe/external-gap/padded-label-defined   replicate -> MATCH
    round-trip unstable set                   20 -> 19
    referee 6237 unchanged, 0 gained 0 lost
    457 tests, main gate green, 0 drift, 4 gates green

**It closed a round-trip entry as a side effect, which no measurement predicted.**
`probe/label-shape/space-only-defined` was a fifth case of the failed-definition escape family
— `[^ ]: x` escaped on pass 1 with the reference following on pass 2 — and it only ever had a
reference to escape because a PADDED label resolved against its definition. Left literal there
is nothing to escape. Four earlier attempts at that family went looking for a `toMarkdown`
handler; the fix was upstream of the formatter.

So the lesson for the other five is not "ship them all" but "a one-case rule can be worth more
than its case count, and the only way to find out is to build one and gate it". The per-pass bar
is about risk, and risk is measurable per pass rather than assumed from a total.

**And a diff direction nearly reverted it.** The round-trip gate failed with
`expected [ …(19) ] to deeply equal [ …(20) ]`, which reads as a 19 → 20 regression and as the
`raw-html/626` escape-growth defect recurring. Vitest puts ACTUAL first, so the set had SHRUNK,
and the `-` line in its diff is Expected rather than Received. This file already records the
same trap for `shapes.mts` printing `obsidian -> ours`, where it cost two hours; here it nearly
cost a working fix. Check the direction before believing a ceiling moved.

Item 24's html is the evidence no projection could give:
`<ul><li><p>a</p><ul><li><p>b</p></li>…` — the outer `<li>` carries a `<p>`, so the outer list
really is loose. We follow CommonMark [307] and make only the innermost loose. The case matches
anyway, because list spread appears in nothing compared, so it is a tree-level difference
outside the compared surface rather than debt.

**27a was closed by a mistake, which is the part to carry.** My probe for `<MAILTO:FOO@BAR.BAZ>`
DISPLACED `commonmark/autolinks/597` — the corpus deduplicates by markdown, so a spec case
triaged `match` came back `unreviewed`. The README says to check for exactly that after a corpus
change; my collision check had searched only `corpus.ts`, and 597 lives in `commonmark.ts`.
Restoring it gave the answer: `text="FOO@BAR.BAZ"`, triage `match`. The scheme IS dropped and we
DO match, because `normalize.ts` drops it in the PROJECTION — the governing rule, AST represents
source and projection represents rendering. A `match` spec case had been pinning it all along.

So check a new case's markdown against `corpus.ts`, `commonmark.ts` AND `gfm.ts` before adding
it, and read the golden diff for displaced ids afterwards.

### How the six looked before the recorder ran

Obsidian was running, so `ask.mts` (cache) and `ask-dom.mts` (DOM projections) could be asked
directly. `release-diff.mts` having measured 1.15.0 as moving nothing across all 3,417 documents
is what makes a 1.15.0 answer usable against goldens pinned at 1.14.4.

| #   | obs, measured                                    | state                                    |
| --- | ------------------------------------------------ | ---------------------------------------- |
| 27a | text `FOO@BAR.BAZ` — **scheme dropped**, no link | **confirmed**, and not uppercase-only    |
| 27b | text `<a+b+c:d>` literal                         | **we already agree**                     |
| 27c | text `foo\+@bar.example.com` — backslash KEPT    | **text agrees; only the node differs**   |
| 18a | text `[ a ]` — stays literal                     | **confirmed**, we emit a `linkReference` |
| 25  | `code@0-2`, byte-identical to the closed fence   | **refuted as a parse gap**               |
| 20  | textContent is `x.svg`; the alt is an ATTRIBUTE  | needs raw HTML                           |
| 24  | `- a`/blank/`- b` also reports `"a b"`           | needs raw HTML                           |

Two things that changes. **27a is not about the uppercase scheme**: `<mailto:foo@bar.baz>` also
renders as `foo@bar.baz`, so Obsidian drops the scheme from the TEXT in both spellings and the
divergence is that our text keeps it. And **27c is smaller than recorded** — our text already
matches, so only the `link` node differs, which puts it in the projection class beside 20 rather
than the parse class.

**Items 20 and 24 are confirmed unreachable by every projection either oracle exposes**, which
is a smaller and more accurate claim than "blocked on a probe". An image alt is an attribute, so
`textContent` reports the src. Loose and tight both flatten to the same `textContent` — the
explicitly loose `- a` / blank / `- b` control reports `"a b"` exactly as the tight form does,
because the `<p>` wrappers that carry the distinction do not survive `textContent`. Settling
either needs the recorder's stored `html`, not a projection.

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
