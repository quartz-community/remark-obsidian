# Obsidian parity harness

This package targets the reading-mode and `metadataCache` semantics of a named public Obsidian
release. That is a measurable claim only against real Obsidian, so this harness renders a
generated corpus inside the actual application and compares the result to ours.

It is deliberately **not** "match Obsidian including every bug". Where Obsidian has an
acknowledged defect the package may diverge on purpose, and every such case is enumerated in
the goldens with a triage state and a reason. "Reading view" alone is also underspecified — the
golden file stamps the exact app and installer version it was recorded against.

This file is the operating manual. The measurement record behind it — what was tried, what was
refused and by how much — is in [`AGENTS.md`](../../AGENTS.md). The 1.x lab notebook that used to
live here, about 12,000 lines on correcting micromark towards Obsidian, is in git history under
the `archive/main-pre-2.0` tag; a comment in the harness that cites "the README" for a
measurement or a refusal means that version.

## What measures what

| oracle                                | measures                                                        | asserted by                                |
| ------------------------------------- | --------------------------------------------------------------- | ------------------------------------------ |
| `goldens/obsidian.json`, 3,471 cases  | rendered projections, `legacy` — **the contract**               | `parity.test.ts`                           |
| the same goldens, positioned          | `metadataCache` positions against our node positions            | `compute.test.ts`, exact ceilings with ids |
| `referee-answers/`, 6,844 documents   | footnote definitions and references, with full spans            | `referee.mts` (a measurement, not a gate)  |
| `referee-spans.json`                  | the spans the vendored answers drop, re-asked of the live cache | `referee-spans.test.ts`                    |
| 652 CommonMark + 24 GFM spec examples | `strict` against stock `remark-parse` + `remark-gfm`            | `strict.test.ts`                           |
| `goldens/strict-syntax.json`, 406     | `strict` on Obsidian's own syntax, live probes                  | `strict-syntax.test.ts`                    |
| `goldens/strict-footnotes.json`, 107  | `strict` on footnotes, which neither spec covers                | `strict-footnotes.test.ts`                 |
| `goldens/probes.json`, 1,697          | drift of probe answers on either side, not agreement            | `probes.test.ts`                           |
| `goldens/compose.json`                | construct sequences against Obsidian                            | `compose.test.ts`                          |
| `goldens/rules-doc.json`              | the worked examples of the upstream reading-rules document      | `rules-doc.test.ts`                        |

## Two phases

Recording needs Obsidian and a display. Checking does not, which is what lets the gate run on
every pull request.

| Command                            | Needs Obsidian | When                        |
| ---------------------------------- | -------------- | --------------------------- |
| `npm test` / `npm run test:parity` | no             | every push and pull request |
| `nix develop -c parity-record`     | yes            | weekly schedule, or by hand |

The recorder boots Obsidian, renders every corpus case, and rewrites `goldens/obsidian.json`.
Then it re-renders the seed layer, and every case known to need it, through a real Reading View
(below) and corrects the goldens in place. A run takes about ten minutes.

**Do not read the goldens until the recorder exits.** Between its two phases,
`commonmark/html-blocks/171` and `hunt/blockquote-region-outlives-quote/1` hold the detached
renderer's answers, and the contract gate fails exactly as if Obsidian had changed.

## Running the recorder

Obsidian is an Electron app, so it needs a display even when nobody is watching. Reading mode
renders off `requestAnimationFrame`, which Chromium starves for windows that are not mapped and
focused — without a window manager the render queue never drains and every capture comes back
empty.

On NixOS, `nix develop` provides Node, `Xvfb` and `herbstluftwm`, wires up `nix-ld` so the
Obsidian binary `wdio-obsidian-service` downloads can run, and supplies a `parity-record`
wrapper. Use the wrapper; bare `npm run parity:record` fails with `ECONNREFUSED` on the driver
port, because the downloaded binary cannot start without `nix-ld`. The wrapper also clears the
launcher's scratch (`/tmp/obsidian-launcher-config-*` accumulates and eventually hangs a launch)
and picks a display whose lock is genuinely free. Its log timestamps are UTC.

| Variable                     | Purpose                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `OBSIDIAN_APP_VERSION`       | App version to record against. Defaults to `latest`.                           |
| `OBSIDIAN_INSTALLER_VERSION` | Installer version. Defaults to `latest`.                                       |
| `OBSIDIAN_APP_PATH`          | Load a local `obsidian.asar`; needs `OBSIDIAN_APP_VERSION` set to its version. |
| `PARITY_FULL_PROXY_CHECK=1`  | Cross-check the whole corpus through Reading View, not only the seed layer.    |

`OBSIDIAN_APP_PATH` is how you preview a release the downloader cannot reach; an insider build
self-installs to `~/.config/obsidian/obsidian-<version>.asar`. The recorder reads the version out
of the asar and refuses to write a golden if the running bundle disagrees, since an ignored
override otherwise records the wrong app under the right label. Do not commit goldens recorded
that way: CI records against `latest`, so goldens from a build CI cannot reach make the weekly
drift job fire.

## The corpus

`corpus.ts` builds the cases deterministically, because random input essentially never lands on
a delimiter boundary.

| layer        | cases | what it holds                                                                              |
| ------------ | ----: | ------------------------------------------------------------------------------------------ |
| `seed`       | 1,689 | documented behaviour, bug reproductions, `probe/<question>/*` families, reduced fuzz cases |
| `token`      |   188 | each inline construct crossed with malformed delimiter states                              |
| `context`    |   238 | each construct inside a container that shields or re-parses it                             |
| `adjacency`  |   120 | what follows a closing delimiter, which often decides whether it closes                    |
| `commonmark` |   643 | the CommonMark spec examples (`commonmark.ts`)                                             |
| `hunt`       |   593 | targeted hunts for one defect each (`corpus-hunt.ts`)                                      |

A `probe/<question>/*` family carries a comment naming its question, because a probe whose
purpose is forgotten gets deleted.

Add a case by editing `SEEDS`, or a family by extending `TOKENS`, `CONTEXTS` or `ADJACENCY`.
Re-record afterwards; new cases arrive as `unreviewed` and the gate fails until they are triaged.

**Cases are deduplicated by markdown**, so a new case whose source matches an existing one
displaces it, and the displaced case's triage state goes with it. Check a new case's markdown
against `corpus.ts`, `commonmark.ts` **and** `gfm.ts` before adding it, and read the golden diff
for displaced ids afterwards.

## What is compared

Rendered HTML is not compared directly. Obsidian wraps every block in `div.el-*`, adds
`data-line` attributes, collapse-indicator SVGs and resolved-link classes; asserting on that
mostly tests Obsidian's view layer. Instead both sides are reduced to the projections in
`types.ts`:

| Projection                                | Source on Obsidian's side            | Source on ours              |
| ----------------------------------------- | ------------------------------------ | --------------------------- |
| `text`                                    | rendered `textContent`               | mdast                       |
| `sections`                                | `metadataCache.sections` offsets     | mdast node positions        |
| `math`                                    | `.math` elements                     | `math` / `inlineMath` nodes |
| `links`                                   | `a.internal-link`, `.internal-embed` | `wikilink` nodes            |
| `tags`, `headings`, `tasks`, `highlights` | DOM                                  | mdast                       |
| `emphasis`                                | `strong`/`em` elements               | `strong`/`emphasis` nodes   |

**`metadataCache` tracks reading view, not live preview.** Obsidian has two parsers and they
genuinely disagree. Every case where the modes provably differ sides with reading view — a `$$`
block swallowing a link, `- [ ] 1.`, `[[A[[B]]]]` — so reading view plus `metadataCache` form one
consistent oracle.

**`sections` is the primary oracle.** It is Obsidian's own block-level parse with byte offsets,
so slicing the source shows exactly what the parser consumed.

**Our side is projected from mdast, not from our HTML.** Producing correct mdast is this
package's job; turning a `wikilink` node into an anchor belongs to the renderer. `normalize.ts`
builds our projections.

**`math[].tex`** is compared whenever the recording stamps `oracle.mathTex` (Obsidian 1.14 and
later expose the LaTeX source). The whitespace _around_ a formula is normalised, since
`$$\nx\n$$` is `"\nx\n"` to Obsidian and `"x"` to `remark-math` and TeX collapses it either way.

**The two sides must exclude the same things.** The recorder reads `text` and `emphasis` off a
clone with `.footnotes` removed, because the renderer relocates every footnote body to the end.
Before treating a projection divergence as a package bug, check what `oracle.e2e.ts` does to the
DOM it reads that projection from — this harness's own asymmetries have been triaged as package
bugs five times.

**Compare projection strings, never parse them.** A link records as
`${original}=>${link}|${displayText}@${span}`, which cannot be split back into its fields.

## The pinned chain

Goldens are only comparable against a fixed pipeline. Quartz v5 orders external packages in
`quartz.config.yaml`, so `chain.ts` pins the parse-affecting subset and stamps it into every
golden. A reorder or membership change upstream invalidates the corpus, and the gate fails rather
than silently comparing against the wrong pipeline. Load-bearing details:

- `obsidian-flavored-markdown` rewrites the markdown **before** remark runs (`applyTextTransform`),
  forcing a newline after every callout title.
- `remark-breaks` changes output, so a golden recorded without it is wrong.
- `@quartz-community/latex` also registers `remark-math`. The duplicate is output-identical, so it
  is reproduced rather than "fixed".

Two profiles: `quartz-default` mirrors the options Quartz actually passes, and `all-features`
turns everything on. A case passes if **either** matches, which separates "this package cannot
do it" from "Quartz's default config disables it". A probe must go through `parseOurs`, which
applies both the text transform and the profile; a hand-assembled processor measures a pipeline
nobody uses.

## Triage

Every case carries a `triage` state. The gate is a **regression** gate, not a perfection gate.

| State                | Meaning                                           | Diverging fails the gate? |
| -------------------- | ------------------------------------------------- | ------------------------- |
| `match`              | We reproduce Obsidian. This is the contract.      | **yes**                   |
| `replicate`          | Known gap we intend to close.                     | no                        |
| `report-upstream`    | Obsidian bug we deliberately do not mirror.       | no                        |
| `upstream-undecided` | Obsidian has not decided; do not chase.           | no                        |
| `out-of-scope`       | Another package in the chain owns this construct. | no                        |
| `accepted`           | Representations differ, output does not.          | no                        |
| `unreviewed`         | Newly recorded, not yet judged.                   | **yes**                   |

A `replicate` case that starts matching also fails, so the backlog cannot rot quietly —
re-triage it to `match`.

At 2.0 every case but two is `match`: `commonmark/html-blocks/171` is `accepted` (below), and
`fuzz/embed/64` is `out-of-scope` — Obsidian resolved an empty `![[ ]]` to the note itself and
embedded it six levels deep, which is vault resolution rather than parsing.

**Moving a case out of `replicate` needs an impossibility argument, and the argument can be
wrong.** Eighteen inline-footnote cases once sat in `report-upstream` on an argument that read
well; once the real rule was implemented, 17 matched outright. Prefer `replicate` while any doubt
remains.

**A recording flake has a signature:** a case whose `text` changed while its `html` is
byte-identical raced the capture. Re-record and it comes back.

## When goldens drift

The scheduled workflow (`.github/workflows/parity.yml`) never commits. It records against
`latest` with the seed-layer Reading View cross-check, as a local recording does, uploads the
goldens as an artifact and opens an issue, because a golden change is a behaviour change and
needs a human to decide which side moved:

- **Obsidian changed.** Update the goldens and re-triage the affected cases.
- **We regressed.** Fix the code; leave the goldens alone.

Recording is deterministic apart from `recordedAt`, which every recording stamps afresh. So the
job asks `goldens-unchanged.mts` first and restores the committed file when nothing else
moved; otherwise every week would read as drift. Obsidian also mints a random suffix for
footnote anchors on every render, which is normalised out of the stored HTML for the same reason.

The job needs a running window manager as well as `Xvfb`, and fails its display step without
one; until 2.0 it started one without a display and recorded with none.

**Reading View's surplus table cells depend on what it rendered before.** A row an unescaped
pipe splits into more cells than the header declares (`| [[Note|Alias]] |` under `| --- |`) is
the `SURPLUS_TABLE_CELLS` family in `oracle.e2e.ts`. On 2026-10-27, same app (1.14.5), same
machine, same window manager: the seed-layer check rendered those cases without their surplus
cells, agreeing with the detached renderer, while the full sweep (`PARITY_FULL_PROXY_CHECK=1`)
rendered them with it. That failed the cross-check on five cases outside the known list
(`probe/table-pipes/body-row-unclosed`, `probe/table-pipes/short-delimiter-closed`,
`table/code-pipe`, `table/math-pipe`, `context/table-cell/wikilink-alias`) and "corrected" two
inside it (`math/in-table-pipe`, `wikilink/table-unescaped`) to text our parse does not give.
The CI run of 2026-10-26 failed on the same five. So the weekly job runs the seed-layer check,
and the full sweep is a manual audit (the workflow's `fullProxyCheck` input). Do not commit
goldens from a full sweep without checking those two cases.

## Reading-view cross-check

The recorder captures through a detached `MarkdownRenderer.render()`, which is fast enough to
batch the corpus and avoids reading mode's viewport-driven lazy rendering. That makes it a
_proxy_, so the second phase re-renders cases through an actual Reading View and compares.

`KNOWN_PROXY_DIVERGENCES` in `oracle.e2e.ts` lists the cases where the two differ, each with a
reason, and they are re-checked on **every** recording whatever layer they are in. Where Reading
View disagrees, its `text` is written into the golden with a note. Any divergence outside the
list fails: the proxy has stopped being faithful and the goldens cannot be trusted. A document
Reading View never mounts (`no leaf for …` in the log) is skipped and reported, not fatal.

**A projection is only comparable against others captured from the same DOM.**
`commonmark/html-blocks/171` (`<textarea>` around two emphasised paragraphs) gets `text` from
Reading View and `emphasis` from the detached render, and no single DOM yields both: `textarea`
is RCDATA to the HTML parser, so the detached render swallows the paragraphs. Our parse agrees
with Obsidian's `sections`; only the two captures disagree with each other. It is `accepted` with
that argument attached — and **do not reach for the measurement when the measurement is what
disagrees with you**: the separator convention could be changed in one line to turn it green,
which is exactly why it must not be.

## Asking Obsidian directly

`ask.mts` evaluates `computeMetadataAsync` in the running app on any string, in about a second,
with nothing written:

```bash
node --import tsx --conditions=development test/parity/ask.mts '[^1]: def' 'use[^1]'
```

Use it to settle a rule, then promote the shapes that settled something into `corpus.ts` — a probe
nobody recorded proves nothing to CI. `ask-dom.mts` asks for the DOM projections the cache does not
carry, through the `parity-probe` plugin in `test-vault/`.

- **Obsidian must be running with a vault open.** `ask.mts` checks liveness first, since both
  failure modes otherwise read as "no metadata".
- **Run it with `node --import tsx`, not `npx tsx`**, which reports `Obsidian is not answering`.
- **Never `2>/dev/null`.** It writes load-bearing warnings to stderr: `footnoteRefs` is
  definition-gated, and the live app may not be the version the goldens pin.
- **Never `--synth` when reading references.** Synthetic answers omit the footnote keys, so the
  probe measures nothing and looks like it worked.
- **`ask-dom.mts` uses the detached renderer**, so on a known proxy divergence it gives the answer
  Reading View does not.

## The referee

`referee.mts` replays 6,844 notes whose answers were recorded from Obsidian's own
`metadataCache.computeMetadataAsync` by the sibling project
[`obsidian-footnotes`](https://github.com/Comprehensive-Jason/obsidian-footnotes). It needs no
Obsidian, and it was generated by someone else's fuzzer against someone else's reading of the
same parser, so it finds what our own generator was never shaped to look for.

The answers are vendored in `referee-answers/` and stay upstream's. `referee-spans.json`, beside
them, holds the full spans the vendored tuples drop (start offset, end line, end column, end
offset) and Obsidian's inline-footnote definitions, re-asked of the live cache by
`record-referee-spans.mts` in about fifteen seconds. Re-run that after any re-sync of the answers;
`referee-spans.test.ts` fails until you do. How to re-sync without degrading the answers is in
`AGENTS.md`.

At 2.0, `legacy` agrees on 6,830 of 6,844 documents, every one of them on full spans, and on all
869 documents with inline footnotes. The 14 left are recorded in `AGENTS.md`'s open items.

## `strict`'s gates

The corpus and the referee measure `legacy`. `strict` has its own:

- **`strict.test.ts`** compares `strict`'s tree with stock `remark-parse` + `remark-gfm` over the
  652 CommonMark and 24 GFM spec examples. Eight differ, all by design and listed with reasons;
  the `LEAK` list must stay empty.
- **`strict-syntax.test.ts`** pins 406 live answers about Obsidian's own syntax — comments,
  callouts, wikilinks and embeds, frontmatter, block ids, inline footnotes, math, tags, task boxes —
  compared on lines. Recorded exclusions carry their reason.
- **`strict-footnotes.test.ts`** pins 107 live answers about footnotes.

## Fuzzing

Three sweeps, each seeing what the others cannot, and a census that runs the invariant one at scale. All are deterministic from a seed, so a report
is reproducible.

| sweep                     | needs Obsidian | per push                                              | nightly (`fuzz.yml`)     |
| ------------------------- | -------------- | ----------------------------------------------------- | ------------------------ |
| `fuzz/sweep.ts`           | yes            | --                                                    | 500 random seeds         |
| `fuzz/invariant-sweep.ts` | no             | `fuzz-invariants.test.ts`, seeds 0-599                | 5,000 random seeds       |
| `fuzz/charclass-sweep.ts` | yes            | `charclass.test.ts`, against `goldens/charclass.json` | a fresh character sample |
| `fuzz/census.ts`          | no             | --                                                    | weekly (`census.yml`)    |

- **Census** runs the invariant fuzz over a large range, sharded across processes, then shrinks
  every failure and clusters the minimal forms by violation, preset and the node types formatting
  loses or gains. Run it before and after a round of fixes, the second time with `--baseline`:

  ```bash
  npx tsx --conditions=development test/parity/fuzz/census.ts 0 1000000 --out <dir>
  npx tsx --conditions=development test/parity/fuzz/census.ts 0 1000000 --out <dir2> --baseline <dir>
  ```

  A million seeds take about 42 minutes on 16 cores (`--workers`, default every core). It writes
  `findings.json`, `clusters.json` and `report.md`, and with `--baseline` exits 1 when a seed
  fails that did not before.

  `goldens/census-baseline.json` is the committed baseline, and `census.yml` holds the million
  seeds to it weekly in eight jobs of 125,000. After a round of fixes, rerun the full range
  with `--baseline goldens/census-baseline.json --update-baseline goldens/census-baseline.json`.
  That refuses to write while any seed is new, so the baseline only records progress.

- **Differential** composes known fragments into documents, records them in Obsidian, compares
  and shrinks every failure to a minimal form. It compares through the Quartz profiles, so it
  sees `legacy` and the tree only; documents that embed the note into themselves are skipped.
- **Invariant** needs no recording: mdast shape and content model, spans, math rendering its own
  value, the rendered Quartz chain (comment markers, footnote links and numbering), formatting
  reaching a fixed point and keeping the words -- under five configurations. `--ignore <kind>`
  skips a kind already recorded.
- **Character class** puts one character at a time into each construct whose reading depends on
  it and compares the `metadataCache` facts under both presets. `--save <file>` writes the
  answers; the committed golden is seed 0.

All three report to one rolling issue labelled `fuzz`. To reproduce a nightly finding, run the
command the issue names; the differential and character sweeps need `nix develop`.

## Files

| File                                            | Role                                                    |
| ----------------------------------------------- | ------------------------------------------------------- |
| `corpus.ts`, `corpus-hunt.ts`                   | Deterministic case generator                            |
| `commonmark.ts`, `gfm.ts`                       | The spec examples                                       |
| `chain.ts`                                      | Pinned Quartz pipeline, feature profiles, `parseOurs`   |
| `normalize.ts`                                  | Our projections, from mdast                             |
| `types.ts`                                      | Shared projection and golden shapes                     |
| `compare.ts`                                    | Diffing and gate policy                                 |
| `oracle.e2e.ts`                                 | Recorder; runs inside Obsidian                          |
| `parity.test.ts`                                | The contract gate; no Obsidian required                 |
| `compute.test.ts`                               | Positioned oracle and its ceilings                      |
| `goldens/`                                      | Recorded answers, version-stamped and triaged           |
| `ask.mts`, `ask-dom.mts`                        | Ask a running Obsidian about arbitrary markdown         |
| `probe-channel.ts`                              | The channel both use, and `askFull` for full positions  |
| `referee.mts`, `referee-facts.ts`               | The referee and our side of its facts                   |
| `record-referee-spans.mts`                      | Re-records `referee-spans.json`                         |
| `referee-shrink.mts`                            | Reduces a referee disagreement to a minimal form        |
| `regressions.mts`                               | Documents we break that stock `remark-parse` gets right |
| `classify.ts`                                   | Shared loading, position identity and sampling          |
| `probe-ledger.mts`                              | Records live probe answers for `probes.test.ts`         |
| `goldens-unchanged.mts`                         | Whether a recording changed anything but `recordedAt`   |
| `fuzz/invariants.ts`, `fuzz/invariant-sweep.ts` | The invariant fuzz and its sweep                        |
| `fuzz/charclass.ts`, `fuzz/charclass-sweep.ts`  | The character-class sweep                               |
| `fuzz/census.ts`                                | The invariant fuzz at scale: sweep, shrink, cluster     |
| `fuzz-invariants.test.ts`, `charclass.test.ts`  | Their per-push gates                                    |
| `compose.mts`, `compose.ts`                     | Construct sequences against Obsidian                    |
| `invariants.test.ts`                            | Structural invariants on the tree itself                |
| `roundtrip.test.ts`                             | Formatting reaches a fixed point                        |
| `option-matrix.test.ts`                         | Every option toggled, looking for crashes               |
| `fuzz/sweep.ts`                                 | The nightly fuzz sweep                                  |
| `COMMONMARK-DIVERGENCES.md`                     | Where Obsidian departs from CommonMark and GFM          |
| `OPEN-QUESTIONS.md`                             | Questions put to the Obsidian team, and their answers   |
| `UPSTREAM.md`                                   | Defects found in upstream packages and Obsidian         |

Several instruments here — `mechanism.mts`, `ablate*.mts`, `legacy-oracle.mts`, `pass-owner*.mts`,
`pass-order*.mts` — attribute behaviour to micromark passes `legacy` no longer runs; see
`AGENTS.md` before trusting their output.

The DOM probe is a plugin, not a harness file: `test-vault/.obsidian/plugins/parity-probe`
exposes a detached `MarkdownRenderer` and a real Reading View, because `obsidian eval` has
`require` but no `obsidian` module. The real view also needs CDP focus emulation, since reading
mode renders off `requestAnimationFrame` and Chromium starves an unfocused window:

```bash
obsidian dev:cdp method=Emulation.setFocusEmulationEnabled params='{"enabled":true}'
```
