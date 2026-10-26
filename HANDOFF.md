# HANDOFF — the remaining parity gap

For someone picking up the last ~8% cold. `AGENTS.md` is the full operational record and the
authority; this file is the gap inventory and the shortest path to being useful. Every figure
here was measured, and the command that produces it is given.

**State: referee 6,307 / 6,844 = 92.2%.** 537 documents diverge, 392 of them on a single
mechanism. 457 tests, 4 gates green, 418 pending changesets against a published 1.1.0.

---

## 1. Orient in five minutes

A remark plugin making a micromark pipeline parse Markdown the way **Obsidian** does. Obsidian
internally runs a fork of **`remark-parse@8`** (rp8) — a line-oriented tokenizer. We reproduce
rp8's _behaviour_ on micromark's _architecture_, and that mismatch is the source of nearly every
open problem.

Two modes. `legacy` (default) reproduces Obsidian including its rp8-inherited divergences, with
**exact positions** — plugin consumers index by them. `strict` is CommonMark/GFM for Quartz, and
its backlog is closed.

```bash
npm test          # 457 tests. parity.test.ts is THE CONTRACT GATE.
npm run typecheck && npm run lint && npm run build && npm run format

# the primary figure, BY IDENTITY -- never compare totals
npx tsx --conditions=development test/parity/referee.mts --ids | sort -u > /tmp/after.s
comm -13 /tmp/before.s /tmp/after.s   # gained
comm -23 /tmp/before.s /tmp/after.s   # lost

npx tsx --conditions=development test/parity/mechanism.mts        # the targeting instrument
npx tsx --conditions=development test/parity/regressions.mts --self-test
PARITY_REFEREE_DIR=test/parity/referee-answers \
  npx tsx --conditions=development test/parity/legacy-oracle.mts  # rp8 as a local oracle
```

**Ship only at N gained / 0 lost.** The contract gate outranks the referee: a referee gain with
a `parity.test.ts` regression does not ship — that has been tried and rejected. A provably inert
`src/` change gets reverted, not shipped as dead code. Never `Read` anything under
`test/parity/` (it auto-attaches a 12,300-line write-only README); use bash/python with asserted
anchors.

---

## 2. The framing that matters: the 2×2 against rp8

rp8 is installed as a dev dependency and answers in-process at thousands of documents per
second. Scored on the full referee test over all 6,844:

|                     |           |                                  |
| ------------------- | --------: | -------------------------------- |
| both right          | **4,618** |                                  |
| WE right, rp8 wrong | **1,689** | what ~100 passes here add        |
| rp8 right, WE wrong |   **288** | correct answer available LOCALLY |
| BOTH WRONG          |   **249** | unknown to both parsers          |

**54% of the gap has a locally computed correct answer.** Those 288 are a work queue with a
known-correct blueprint — rp8's tree is the answer and the diff between the trees is the rule.
The 249 need the live Obsidian oracle, which is how all 15 fixes in the last session were
derived.

Obsidian is deterministic, so a mechanism exists for every one of the 537 by construction.
Nothing here is known to be inexpressible. What is refused is specific **global rules** and
specific **selectors** — see §5.

---

## 3. Gap inventory

One-mechanism documents, from `mechanism.mts`, with how many rp8 already gets right.

| mechanism                | one-away | present | rp8 has it | status                                    |
| ------------------------ | -------: | ------: | ---------: | ----------------------------------------- |
| `ref-extra @ paragraph`  |       76 |     124 |     **43** | label half refused at 97.6%; 25 ungrouped |
| `def-span-longer`        |       59 |      84 |         28 | refused as a rule — oracle agrees 46/47   |
| `def-miss @ code`        |       53 |      65 |     **38** | **live lead, §4**                         |
| `ref-miss @ code`        |       45 |      67 |     **29** | **live lead, §4**                         |
| `def-span-shorter`       |       32 |      42 |         13 | same family as `def-span-longer`          |
| `def-col`                |       26 |      35 |         15 | 99.3% agreed; needs a content-column grid |
| `ref-miss @ paragraph`   |       15 |      15 |          7 | IS the unplaced family, 30/30             |
| `def-extra @ listItem`   |       14 |      42 |         10 | diffuse; largest bucket 16 of 94          |
| `def-extra @ blockquote` |        9 |      21 |          7 | same                                      |
| `ref-extra @ comment`    |        8 |      13 |          5 | host rule refused at 1.0%                 |
| `def-miss @ math`        |        7 |      11 |          — | math container defect, §4                 |
| `ref-col`                |        6 |       6 |          0 | **closed** — 4 of 6 are must-not-fix      |
| `ref-miss @ math`        |        5 |      12 |          — | math container defect, §4                 |
| `def-miss @ blockquote`  |        5 |       5 |          5 | unexplored                                |

Two cross-cutting facts worth knowing before touching any of it:

- **The literal `[^name]` is present at 228 of 232 `ref-MISS` positions.** That dimension is
  never an offset or alignment problem — the text is there and the construct covering it is
  inert for us and live for Obsidian.
- **The pair table overstates.** A swap produces two facts, so every swap document registers as
  two mechanisms; 33 of 33 in the largest pair share one position. Read the one-away figure.

---

## 4. Live leads, ranked

### 4a. The host split on the code dimension — the best lead

Derived from rp8's blueprint rather than from our divergences. The diff is **unanimous**: 71 of
71 positions are "we say `code`, rp8 says content", every source line carrying a **tab inside
its container prefix**, across three hosts (quote 27, listItem 27, root 17).

Measured three ways:

| as a…                           | precision         | verdict                            |
| ------------------------------- | ----------------- | ---------------------------------- |
| line-shape predicate (tab)      | 8.8% (77 / 800)   | refuted — rp8 uses tokenizer state |
| rp8 as a runtime oracle         | 37.9% (106 / 174) | refuted                            |
| **split by host of our `code`** | see below         | **first >70% in this territory**   |

| host                 | GAIN | BREAK |      prec |
| -------------------- | ---: | ----: | --------: |
| `blockquote`         |   32 |     8 | **80.0%** |
| `footnoteDefinition` |    3 |     1 |     75.0% |
| root                 |   24 |    11 | **68.6%** |
| `listItem`           |   45 |    69 |     39.5% |
| `callout`            |    2 |    82 |      2.4% |
| `comment`            |    0 |     3 |      0.0% |

**The split is principled, not fitted: rp8's disagreement is informative only where rp8 HAS the
construct.** `callout` and `comment` are this package's own extensions — rp8 has no concept of
either, so its reading there is uninformed, and that is 82 of the breaks in one row.
`blockquote` and root are native to both parsers.

Combined blockquote + root + footnoteDefinition: 59 gain / 20 break, 74.7% at POSITION level.

**RE-SCORED AT DOCUMENT LEVEL, AND IT IS THE LARGEST MOVEMENT IN THE BACKLOG:**

| scope                                  | gained | lost |     net |
| -------------------------------------- | -----: | ---: | ------: |
| blockquote + root + footnoteDefinition |     50 |   12 | **+38** |
| blockquote + root                      |     48 |   12 |     +36 |
| blockquote only                        |     29 |    4 |     +25 |

Controlled first: the simulation re-sorts the merged fact arrays and the referee compares
ORDERED arrays, so sorting alone was scored on its own — 6,307 either way, 0 verdicts flip. The
+38 is not a sort artifact. This is also the first document-level re-score in this effort to
come out MORE generous than its position-level figure rather than less.

**It is NOT shippable as it stands, for two independent reasons.**

1. **12 losses against a standing N/0 bar.** They concentrate in this package's own extensions
   — `%%` closers 4, math 2, the `night:c6` pipeless-table family 4, plus 2 ref-only. Excluding
   documents that hold any Obsidian-only construct cuts losses 12 → 5 but costs 22 gains (net
   +38 → +23), so that crude exclusion is worse than none. A POSITION-level exclusion has not
   been tried and is the obvious next narrowing — derive it on principle, not by naming the
   losing families.
2. **Implementing it means running rp8 AT RUNTIME.** The simulation merges rp8's facts into
   ours. Doing it for real adds `remark-parse@8`, `remark-footnotes@2`, `remark-math@3` and
   `unified@9` as PRODUCTION dependencies and parses every document twice — an architectural
   decision for a package that ships to Quartz, not a pass. See §7.

### 4b. The math extension's container defect

**Debt: 21 documents** (ablation: `math:false` is 21 gained / 900 lost, so the extension is
overwhelmingly load-bearing and its debt is bounded). Minimal reproduction, one variable at a
time:

```
* parent Prose here `[^Note]` end.
   2) $$
<TAB>$$
```

A **closed** `$$` opened after a **nested** list marker inside a list item destroys the inline
tokenization of the item's **first** line; the `math` node captures an empty value. `$$` at
column 0 is clean, unclosed is clean, no list is clean, `math:false` is always clean, and stock
is right. The leaked footnote reference is a _symptom_ — `bareFootnoteRefTransform` then finds a
bare `[^Note]` in text that should have been `inlineCode`.

Eliminated by measurement: upstream `micromark-extension-math` alone is **correct**; our
`mathTextSyntax` is **exonerated**; `legacy-list.ts`'s B3 minimum is **exonerated by
instrumentation** (that branch never fires); `legacyCodeSpans` is **exonerated**. The defect
survives `preset: "strict"` with everything off but `math`, and **no flag but `math` changes the
output**, so the partner is unconditional. Strongest remaining candidate:
`legacyIndentedCodeSyntax` (`src/index.ts:710`), which registers at `flowInitial[horizontalTab]`
and so may claim the `<TAB>$$` closing fence as indented code. One run tests it.

Fixing this also unblocks the **11 `bareFootnoteRefs` self-inflicted documents**, where stock is
right and our pass deletes the correct answer; every source-level guard there is refused
(code-span 5/1, math 5/8, inline-footnote 9/66) because a tree-derived test is needed and this
defect is what breaks the tree.

### 4c. Smaller, unexplored

`def-miss @ blockquote` (5, rp8 has all 5) · the 25 ungrouped `ref-extra @ paragraph` rows ·
`ref-miss @ footnoteDefinition` is a structural gap, 50 of 54 being references in untokenized
gaps between a definition's children.

---

## 5. Refused, with numbers — do not re-attempt without new evidence

| attempt                                        | measured                       |
| ---------------------------------------------- | ------------------------------ |
| adopt rp8's definition EXTENTS wholesale       | 58 gain / 98 lost, **net −40** |
| select between ours and rp8's EXTENTS per doc  | **51%** — a coin flip          |
| count a list separator tab as ONE column       | 11 gain / 65 lost, **net −54** |
| `def-span` as a rule                           | oracle agrees **46 of 47**     |
| …its two dominant shapes                       | 83% and 91.6% already agreeing |
| `probe:i1` as a paragraph-interrupt rule       | **2.0%**, no separating axis   |
| `ref-extra @ paragraph` label half             | 2,183 sites, **2,130 indexed** |
| any host-level reference exclusion (all seven) | 1.0% · 1.0% · 19.0% · 0.3% …   |
| relocating nested `code` to root               | 2 gain / **1,635 break**       |
| placing unplaced references indiscriminately   | +12 / −8                       |
| the empty-`math` tree signature as a predicate | 1.53× lift, 212 of 241 agree   |
| the interruption broker                        | 29 of 52 tuples **contradict** |

**~3 documents are must-not-fix**: P1/P2 are Obsidian cache bugs where our answer is correct.
`ref-col` is 6 of 17,885 and 4 of those are P1/P2.

---

## 6. Traps, each of which has cost a measurement here

- **A `Def` is a FOUR-tuple**; the fourth field is its end line. Comparing `name@line@column`
  silently ignores it — this has cost three separate measurements.
- **`named()` drops empty-named rows** and the referee's compare is an **ordered**
  `JSON.stringify`. Never reimplement the agreement test; a reimplementation without `named()`
  manufactured a plausible 22-document family that does not exist.
- **A position-level gain is not a document-level gain.** Mispredicted five times, both ways.
- **Compute the control before the population.** A population built for a hypothesis its own
  control then refutes says nothing.
- **Probes must go through `parseOurs`** — it applies `applyTextTransform` and
  `PROFILES["quartz-default"]`. A hand-built processor measured a pipeline the harness does not
  use and read `clean` where the instrument read `LEAKS`.
- **A shrink predicate must encode the DIVERGENCE**, not our side of it, or the minimiser drives
  to a degenerate case.
- **Hand-rolled span predicates come back contaminated** — eight times now. Ask the tree, or run
  the tokenizer; do not re-implement it.
- **When a sweep reports no owner, suspect the matcher.** Call sites sit at three indentation
  depths (98 total). Use a known-positive control.
- **0% and 100% are equally suspicious.** "Every flag fixes it" means the test is wrong.
- **`mechanism.mts` prints `ranked.slice(0, 20)`** — a one-document mechanism ranks ~30th and is
  invisible. Read `/tmp/mechanism.json`.
- **A clean exit can still lose data.** `process.exit` discards buffered async pipe writes, and
  `fs.writeSync` on a 64 KB pipe returns a partial write. Verify instrument output by count.

---

## 7. The strategic question, priced

Upstream `obsidian-footnotes` reports **99.2%** on this same corpus — our referee answers are
_their_ recordings, so the documents are identical. But rp8 + `remark-footnotes@2` scores only
**5,972/6,844** here. Their 99.2% is rp8 **plus** four Obsidian extensions **plus** their own
`src/parsing/` layer.

The difference is not rp8's power. It is that **they correct on Obsidian's own architecture and
we correct on a foreign one** — which is why their corrections compose and ours conflict. The
evidence: rp8 holds the answer for every definition-side family we refused and none of the
reference-side ones, because line selection governs definitions while the reference side is
`metadataCache` semantics rp8 has no concept of — and that is where we beat rp8 in 1,689
documents.

| option                  | consequence                                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stay on micromark       | keeps `strict`/CommonMark and the 1,689; the gap is rules per mechanism                                                                                                                             |
| dual-parse with rp8     | **depends entirely on scope** — EXTENTS are net −40, but the CODE dimension scoped by host is **+38 documents** (§4a), at the cost of 4 legacy production deps and a second parse of every document |
| port to rp8 as the base | 99.2% by precedent, but abandons `strict` and re-opens the 1,689                                                                                                                                    |

That is a product decision, not an engineering one. `strict` exists specifically to serve Quartz
with CommonMark compliance, and rp8 predates CommonMark.
