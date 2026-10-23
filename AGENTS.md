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

**Strict is under-gated.** The 6,818-document corpus measures `legacy`. As of this writing strict
has one smoke assertion, and a differential against stock `remark-parse` + `remark-gfm` over the
652 CommonMark spec examples shows **32 divergences, 26 of them in node types**, clustering on
tabs. Unlike legacy, strict has a _closed_ oracle (a published spec with known answers), so that
work terminates. Prefer it.

## Gates — what "done" means

```bash
npm test          # 450 tests / 17 files. Contains the contract gate.
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

| instrument           | answers                                                                    | trap                                                                           |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `classify.ts`        | shared primitives: loading, position identity, populations, lift, sampling | **use this instead of re-reading the corpus**; `--self-test` must be green     |
| `referee.mts`        | how many of 6,818 documents agree                                          | diff `--ids` identities, **never totals**                                      |
| `mechanism.mts`      | which documents are ONE mechanism from agreeing                            | classifies EXTRA facts by _host_, MISSING by _cover_                           |
| `ablate.mts`         | per-flag DECISIVE / CULPABLE                                               | accepts both id schemes; has `--self-test`                                     |
| `legacy-oracle.mts`  | documents where rp8 is right and we are wrong                              | **rp8 is not a ceiling** — we are right where rp8 is wrong in ~1,000 documents |
| `referee-shrink.mts` | minimise a diverging document                                              | `--live` hits Obsidian                                                         |
| `ask.mts`            | the live Obsidian oracle                                                   | see below                                                                      |

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

## Architectural conclusion (do not re-litigate without new evidence)

Roughly 184 divergences are **flag-irreducible**: no single flag and no pair of 24 reaches them.
An owner-aware "interruption broker" was the proposed general fix. It was **built as a shadow
instrument and failed its own contradiction test** — for owner `footnoteDefinition`, 29 of 52
observable tuples demand both _continue_ and _interrupt_, and that survived excluding container
closures and blank lines. `gfmTable lt4` sits at 25/26, a coin flip.

Consequence: **narrow per-construct exclusions are the correct strategy, and the remaining gap is
architectural rather than a cleverness deficit.** Forking micromark's document initializer is also
closed off — `parse.js` hardcodes it and `mdast-util-from-markdown` imports `parse` directly.

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
  mismatch; `652 of 652 differ` came from one additive root field (`data.lineOffsets`).
- **An inert probe looks exactly like a working one.** Verify by identity (`--ids`), not by total.
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
