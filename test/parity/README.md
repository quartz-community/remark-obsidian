# Obsidian parity harness

This package targets the reading-mode and `metadataCache` semantics of a named
public Obsidian release. That is a measurable claim only against real Obsidian, so
this harness renders a generated corpus inside the actual application and compares
the result to ours.

It is deliberately **not** "match Obsidian including every bug". Where Obsidian has
an acknowledged defect the package may diverge on purpose, and every such case is
enumerated in the goldens with a triage state and a reason. "Reading view" alone is
also underspecified — the golden file stamps the exact app and installer version it
was recorded against.

## Two phases

Recording needs Obsidian and a display. Checking does not, which is what lets the
gate run on every pull request.

| Command                            | Needs Obsidian | When                        |
| ---------------------------------- | -------------- | --------------------------- |
| `npm test` / `npm run test:parity` | no             | every push and pull request |
| `npm run parity:record`            | yes            | weekly schedule, or by hand |

`parity:record` boots Obsidian, renders all corpus cases, and rewrites
`goldens/obsidian.json`. It runs with `--conditions=development` so micromark's
assertions are active, matching vitest: without that the recorder pins output
produced under a build where invariant violations pass silently, and the gate then
reports drift for cases that never really agreed. That mismatch is how a real
`expected eol or eof` violation in the comment tokenizer stayed hidden. The gate reads those committed goldens and compares them
against our own output. A full recording of the 490 cases takes about 70 seconds.

## Running the recorder

Obsidian is an Electron app, so it needs a display even when nobody is watching.
Reading mode renders off `requestAnimationFrame`, which Chromium starves for
windows that are not mapped and focused — without a window manager the render
queue never drains and every capture comes back empty.

On NixOS, `nix develop` provides Node, `Xvfb` and `herbstluftwm`, wires up
`nix-ld` so the Obsidian binary `wdio-obsidian-service` downloads can run, and
supplies a `parity-record` wrapper. Use the wrapper:

```bash
nix develop
parity-record
```

Driving `Xvfb` by hand works until it does not, and both failure modes are
silent:

- Obsidian's launcher leaves a `/tmp/obsidian-launcher-config-*` directory with
  a cached asar behind on every run. They accumulate, and a few hundred are
  enough to make the next launch hang before printing anything.
- A server killed without cleanup leaves `/tmp/.X<n>-lock` with no process
  behind it, and the next `Xvfb` silently refuses that display.

The wrapper clears the scratch, picks a display whose lock is genuinely free,
and tears down through a trap so the lock goes even when the recorder crashes
or is interrupted.

Environment variables:

| Variable                     | Purpose                                                  |
| ---------------------------- | -------------------------------------------------------- |
| `OBSIDIAN_APP_VERSION`       | App version to record against. Defaults to `latest`.     |
| `OBSIDIAN_INSTALLER_VERSION` | Installer version. Defaults to `latest`.                 |
| `OBSIDIAN_APP_PATH`          | Load a local `obsidian.asar` instead of downloading one. |

`OBSIDIAN_APP_PATH` is how you preview a release the downloader cannot reach. An
insider build self-installs to `~/.config/obsidian/obsidian-<version>.asar`, so:

```bash
OBSIDIAN_APP_PATH=~/.config/obsidian/obsidian-1.14.2.asar npm run parity:record
```

Do not commit goldens recorded that way. CI records against `latest`, so goldens
from a build CI cannot reach will make the drift detector fire every week.

## The corpus

`corpus.ts` builds 490 cases deterministically in four layers. Random input is
useless here because it essentially never lands on a delimiter boundary.

`TOKENS` covers CommonMark's `*`, `**` and `_` alongside Obsidian's own delimiters.
Emphasis is not an Obsidian construct, but Obsidian's tokenizer diverges from
CommonMark on it, so it needs the same context and adjacency coverage as the rest —
see [`COMMONMARK-DIVERGENCES.md`](COMMONMARK-DIVERGENCES.md).

1. **seed** — documented behaviour and reproductions from real bug reports.
2. **token** — each inline construct crossed with malformed delimiter states
   (no closer, doubled opener, empty body, nested, escaped, unicode, very long).
3. **context** — each construct spliced into containers that shield or reparse
   their contents (list item, task, blockquote, callout, table cell, code span,
   fenced code, HTML block, indented code).
4. **adjacency** — what follows a closing delimiter, which is often what decides
   whether the closer is recognised at all.

Add a case by editing `SEEDS`, or a whole family by extending `TOKENS`,
`CONTEXTS`, or `ADJACENCY`. Re-record afterwards; new cases arrive as
`unreviewed` and the gate fails until they are triaged.

## What is compared

Rendered HTML is not compared directly. Obsidian wraps every block in `div.el-*`,
adds `data-line` attributes, collapse-indicator SVGs, and resolved-link classes;
asserting on that is unmaintainable and mostly tests Obsidian's view layer.

Instead both sides are reduced to the projections in `types.ts`:

| Projection                                | Source on Obsidian's side            | Source on ours              |
| ----------------------------------------- | ------------------------------------ | --------------------------- |
| `text`                                    | rendered `textContent`               | mdast                       |
| `sections`                                | `metadataCache.sections` offsets     | mdast node positions        |
| `math`                                    | `.math` elements                     | `math` / `inlineMath` nodes |
| `links`                                   | `a.internal-link`, `.internal-embed` | `wikilink` nodes            |
| `tags`, `headings`, `tasks`, `highlights` | DOM                                  | mdast                       |
| `emphasis`                                | `strong`/`em` elements               | `strong`/`emphasis` nodes   |

Two of these deserve explanation.

**metadataCache tracks reading view, not live preview.** Obsidian has two parsers
and they genuinely disagree, so the harness needs to know which one the API
reflects. Measured on 1.14.2, across cases where the modes provably differ:

| Input                        | Live preview        | Reading view          | metadataCache            |
| ---------------------------- | ------------------- | --------------------- | ------------------------ |
| `$$` block swallowing a link | link is live        | link eaten by math    | `links: []` — reading    |
| `- [ ] 1.`                   | flat, 2 items       | reparsed, nested      | `listItems: 4` — reading |
| `[[A[[B]]]]`                 | outer-ish           | inner wins, links `B` | `links: ["B"]` — reading |
| `**unterminated`             | styles bold forward | no emphasis           | no signal recorded       |

Every discriminating case sides with reading view, and none with live preview. So
reading view plus `metadataCache` form one consistent oracle, and there is no need
for a second live-preview oracle. That is why `sections` can be trusted.

**`sections` is the primary oracle.** It is Obsidian's own block-level parse with
byte offsets, so slicing the source shows exactly what the parser consumed. A
`math` section that runs past its closing `$$` is direct evidence of a swallowed
heading or link, and unlike the DOM it is stable across Obsidian versions.

**Our side is projected from mdast, not from our HTML.** Producing correct mdast
nodes is this package's responsibility; turning a `wikilink` node into an anchor
belongs to `obsidian-flavored-markdown`. Our chain has no hast handler for
`wikilink` or `tag`, so those nodes vanish when rendered — an HTML-derived
projection would report an empty string for every wikilink case.

`math[].tex` is conditional. Obsidian 1.14 exposes the LaTeX source in
`data-latex`; 1.13 and earlier discard it irrecoverably. The recorder probes for
the capability and stores it as `oracle.mathTex`, and the comparison drops `tex`
from both sides when it is false.

Since **1.14.4 became `latest`** the main golden records `mathTex: true`, so the
formula itself is compared for every case. That retired a second oracle: while
1.14 was beta-only a full golden recorded from it would have made the weekly
drift job fire, so `goldens/math-content.json` held the math projection for the
76 math cases separately. The main golden is now a strict superset of it — same
capability, every case, one triage state per case — and both it and
`math-content.test.ts` are gone. The root causes those entries carried were
moved into the corresponding notes in `goldens/obsidian.json`.

Turning `tex` on was not free, which is the point of having done it: it had left
**wrong `$$` delimitations behind a green gate**, agreeing only on the `display`
flag. `$$x^2` is the clearest — stock `mathFlow` follows the code-fence
template, so the formula lands in the node's `meta` (an info string, as a code
fence's language would be) and the math body is empty, while Obsidian renders
`x^2`. Twelve such cases moved from `match` to `replicate` on adoption.

The comparison normalises the whitespace _around_ a formula, because Obsidian
reports `$$\nx\n$$` as `"\nx\n"` while `remark-math` reports `"x"` and a
container's indentation can survive a fragment re-parse — three spellings that
render identically, since TeX collapses a run of whitespace. A formula whose
characters differ still fails: `$$\nMath$$` reports `Math` where we report
`Math$$`.

Note the recorder stamps `obsidian.app` from the running bundle's `apiVersion`,
not from wdio's version getters — those report the _installer_, so an
`OBSIDIAN_APP_PATH` override would otherwise mislabel a recording.

## Coloured highlights, coming in 1.14

1.14 colours a highlight from a leading emoji, as Bear does. That is a **parse**
change, not only a rendering one: the emoji is consumed, so it leaves both the
rendered text and the highlight's content.

Measured by recording the whole corpus against 1.13.7 and against the 1.14.4
beta and diffing. Of 1503 cases **only the highlight probes differ**, so 1.14
changes nothing else this harness can see.

| Input          | 1.13.7 content | 1.14.4 content |
| -------------- | -------------- | -------------- |
| `==🔴 text==`  | `🔴 text`      | ` text`        |
| `==🔴text==`   | `🔴text`       | `text`         |
| `==🔴==`       | `🔴`           | `` (empty)     |
| `==te🔴xt==`   | `te🔴xt`       | unchanged      |
| `==🔴🟩text==` | `🔴🟩text`     | `🟩text`       |

Four rules fall out of that, each measured rather than assumed:

- Only a **leading** emoji is consumed; one mid-content is ordinary text.
- Only **one** is consumed, so the second of two survives.
- The separating space is **kept** — the content begins with it.
- Exactly **twelve** pictographs count, the six rainbow circles and the six
  rainbow squares: 🔴🟠🟡🟢🔵🟣 and 🟥🟧🟨🟩🟦🟪.

The set is closed, not a sample. Both families were probed in full — all nine
circles and all nine squares — and brown, black and white are _not_ markers in
either (🟤⚫⚪🟫⬛⬜ stay in the content). Twenty-two further candidates from
every other colour-bearing family were tried and **none** qualified: the six
coloured hearts, the four coloured books, the six geometric squares outside the
large block (◼◻◾◽▪▫), the diamonds 🔷🔹🔸, 🔻, 🔘, and earlier ❤ ⭐ ✅ 🔺 🌕 🔶
🚩, a variation-selector heart and a ZWJ family sequence.

Three details matter for implementing it:

- The strip is by **codepoint, not grapheme**. `==🔴\uFE0F text==` consumes the
  circle and leaves the variation selector orphaned at the front of the
  content, so a grapheme-aware strip would not reproduce Obsidian.
- Any whitespace after the marker survives, including a tab and a newline:
  `==🔴\ttext==` keeps the tab, `==🔴\ntext==` keeps the line ending.
- The marker does not rescue a highlight that would not form anyway. `== 🔴
text==` is not a highlight at all, because the content may not begin with
  whitespace, and `\==🔴 text==` stays escaped.

**This package needs no change for it.** The emoji is dropped when rendering
while the file keeps its text, which is the same shape as an undefined footnote
reference and a surplus table cell: reproducing the drop in the tree would let
a formatter delete the author's emoji. So the mdast keeps the whole content and
`rehype-obsidian` strips the marker and applies the colour, exactly where it
already bares a dangling footnote reference.

**The tripwire fired as designed.** While 1.13.7 was `latest` nothing was
implemented, deliberately: 1.13.7 does **not** consume the emoji, so stripping it
then would have been wrong for current Obsidian. The probe cases carried the
characterisation instead, recorded against 1.13.7 and waiting.

1.14.4 became `latest` and 21 of them diverged on `text` and `highlights` at
once. Re-recording confirmed the scope held on a corpus four times the size it
was measured on: across 2680 cases **only** the highlight probes and the newly
visible `math[].tex` moved, so 1.14 still changes nothing else this harness can
see.

What landed is the projection half — `stripColourMarker` in `normalize.ts`, by
codepoint so an orphaned variation selector survives. The tree is untouched, as
above: `rehype-obsidian` owns stripping the marker and applying the colour.

## The pinned chain

Goldens are only comparable against a fixed pipeline. Quartz v5 has no built-in
transformers — every one is an external package ordered in `quartz.config.yaml` —
so `chain.ts` pins the parse-affecting subset and stamps it into every golden. A
reorder or membership change upstream invalidates the corpus, and the gate fails
rather than silently comparing against the wrong pipeline.

Three details in there are load-bearing and were each checked against upstream
source rather than assumed:

- `obsidian-flavored-markdown` rewrites the markdown **before** remark runs,
  forcing a newline after every callout title. Its callout visitor then splits on
  that newline, so skipping the pre-transform reproduces a title/body leak that
  upstream has already fixed.
- `remark-breaks` changes output (`Hello $$` becomes `Hello $$<br>`), so a golden
  recorded without it is wrong.
- `remark-obsidian` defaults `math: true` and receives no `math` option, while
  `@quartz-community/latex` also registers `remark-math`. The duplicate
  registration is redundant but provably output-identical, so it is reproduced
  rather than "fixed".

Two profiles are compared: `quartz-default` mirrors the options Quartz actually
passes (note `enableCheckbox` is `false` upstream, so custom task characters are
off), and `all-features` turns everything on. A case passes if **either** matches,
which distinguishes "this package cannot do it" from "Quartz's default config
disables it".

## Triage

Every case carries a `triage` state. The gate is a **regression** gate, not a
perfection gate — a perfection gate would be red from the first commit and get
ignored.

| State                | Meaning                                           | Diverging fails the gate? |
| -------------------- | ------------------------------------------------- | ------------------------- |
| `match`              | We reproduce Obsidian. This is the contract.      | **yes**                   |
| `replicate`          | Known gap we intend to close.                     | no                        |
| `report-upstream`    | Obsidian bug we deliberately do not mirror.       | no                        |
| `upstream-undecided` | Obsidian has not decided; do not chase.           | no                        |
| `out-of-scope`       | Another package in the chain owns this construct. | no                        |
| `accepted`           | Representations differ, output does not.          | no                        |
| `unreviewed`         | Newly recorded, not yet judged.                   | **yes**                   |

A `replicate` case that starts matching also fails, so the backlog cannot rot
quietly — re-triage it to `match`.

`upstream-undecided` exists because some answers are "we have not thought about
this yet". Mirroring those would pin us to behaviour that may change, so they are
tracked separately from confirmed bugs.

`out-of-scope` carries real weight: callouts are handled by
`obsidian-flavored-markdown`'s mdast visitor and frontmatter by Quartz's
FrontMatter plugin, with `remark-frontmatter` absent from the pinned chain. Those
cases would otherwise look like parity bugs forever.

## When goldens drift

The scheduled workflow never commits. It uploads the freshly recorded goldens as
an artifact and opens an issue, because a golden change is a behaviour change and
needs a human to decide which side moved:

- **Obsidian changed.** Update the goldens and re-triage affected cases. Cases
  that were `report-upstream` may now be fixed upstream.
- **We regressed.** Fix the code; leave the goldens alone.

Recording is deterministic, so any diff is real. Obsidian mints a random suffix
for footnote anchors on every render, which is normalised out of the stored HTML
for exactly this reason.

## Reading-view cross-check

The recorder captures through a detached `MarkdownRenderer.render()`, which is
fast enough to batch the whole corpus and avoids reading mode's viewport-driven
lazy rendering. That makes it a _proxy_ for the real view, so the second test
re-renders every seed case through an actual Reading View and compares.

`KNOWN_PROXY_DIVERGENCES` in `oracle.e2e.ts` lists cases where the two differ in
display while agreeing on the parse, each with a reason. Any divergence outside
that list fails: the proxy has stopped being faithful and the goldens cannot be
trusted.

Only the seed layer is checked on every recording, because it is small enough to
stay cheap. `PARITY_FULL_PROXY_CHECK=1` widens the sweep to the whole corpus —
about seven minutes against eighty seconds, so it is a deliberate audit rather
than a default:

```bash
PARITY_FULL_PROXY_CHECK=1 parity-record
```

Run it when the goldens are re-recorded against a new Obsidian, or when a case
resists explanation. It is worth doing: it found a golden recording
detached-renderer behaviour Obsidian does not produce, which had defeated
several attempts to find a parsing rule because there was none to find.

Every id in `KNOWN_PROXY_DIVERGENCES` is now re-checked on **every** recording
whatever layer it is in, and where Reading View disagrees its `text` is written
into the golden with a note saying so. A proxy that is wrong about Obsidian
should not be what the gate asserts, and leaving the correction to an opt-in
seven-minute sweep is what let one sit in the backlog as a divergence with no
rule behind it.

That cuts both ways, so re-measure before assuming. `hunt/table-delimiter-cell-count/0`
was annotated as another unfaithful capture; when the check was made automatic
the two renderers agreed, and `| a | b |` over `| --- |` really does render as
`a` alone. The delimiter declares the columns — the surplus cell stays in the
tree and is dropped only when rendering.

## The referee: a second, independent oracle

`referee.mts` replays ~6800 notes recorded from Obsidian's own
`metadataCache.computeMetadataAsync` by the Obsidian Footnotes Shortcuts plugin.
It needs no Obsidian, so it costs seconds, and it is stricter than this corpus in
two ways that matter: it compares **exact positions**, and it was generated by
someone else's fuzzer against someone else's reading of the same parser — so it
finds what our own generator was never shaped to look for.

It is a measurement, not a gate: the corpus belongs to a sibling project on its
own release cycle and is not vendored. Run it against a clone:

```bash
git clone --depth 1 https://github.com/Comprehensive-Jason/obsidian-footnotes /tmp/of
PARITY_REFEREE_DIR=/tmp/of/test/obsidian-answers \
  npx tsx --conditions=development test/parity/referee.mts
```

It took this package from 41.1% to 61.8% agreement, and seven of the rules in
`src/lib` exist because of it. What it reports now, and what is known about each
remaining family:

| disagreement            | count | state                                                            |
| ----------------------- | ----: | ---------------------------------------------------------------- |
| reference set differs   |  1003 | mostly cascades from a missing or invented definition            |
| same names, wrong spans |   721 | definition spans; the column family is the open one — see below  |
| both sets differ        |   538 | as above, compounded                                             |
| definition set differs  |   340 | the directly actionable bucket; 90.0% of documents already agree |

### A `%%` comment defines nothing, but its references still count

Two opposite rules, and the referee needs both to measure anything here at all:

- A **definition** inside a comment does not define.
- A **reference** inside one is still indexed.

The asymmetry is measured, not assumed. Across the 2119 corpus documents holding
a `%%`, counting in-comment references makes **710** of them agree that would
otherwise not, against **28** that agree only when those references are excluded —
so the references are indexed and the 28 are a separate family.

The definition half was a bug **in this measurement**, not in the package.
`parseComments` puts a comment's body in its `children` as real nodes, so the
referee's plain `visit` counted the buried definition and reported every such
document as one where we invent a definition Obsidian lacks: **247** of them, none
real. `normalize.ts`'s `definedFootnotes` had the rule right all along and the
gate was never wrong. Fixing the walk moved 146 documents out of `both sets
differ`, whose definition halves were already correct.

That is the third time an oracle's first findings have included bugs in the oracle
rather than the package, which is why a new one is measured before it is gated.
A corollary worth keeping: the letter-case hypothesis for this same bucket died in
one measurement — **zero** documents differ only by case, because Obsidian
lowercases a label exactly as mdast does (`[^Note]:` is recorded as `note`).

Reference _positions_ are essentially exact: nine differ across the whole
corpus, and the distinct causes are known — one byte-order-mark document, and two of the
author's `P1`, where Obsidian's cache reports a column short by the width of a
`%%` marker. Fixing those two would be a regression.

Definition spans are the open ground, now ~810 across two families:

- **End line** (310, was ~553). Obsidian ends a definition at an unclosed opener
  inside it while we let the construct run on. The trailing-blank half is fixed —
  micromark let an unclosed indented fence consume the blank after it and grow the
  span by a line — and `%%` and the remaining fence cases need their own evidence.
  Group by the line _we wrongly include_ against the one _Obsidian ends on_:
  grouping by what follows Obsidian's end reports "blank" for most of them
  whatever the cause, and sent me after a rule the legacy stack then refused.
- **Start column** (440, with 62 more differing on both ends). Obsidian reports a column _short_ of where the `[`
  actually is, by no constant amount: `    [^12]:` is column 2 to it and 4 to us,
  `- [ ]    [^x]:` is 6 against 9, `- [ ]  [^x]:` is 6 against 7. This may be a
  third instance of the class the author documented as `P1`/`P2` — a column
  computed as if some prefix were absent — rather than anything to reproduce.
  **Probes are needed before any of it is treated as a rule**; inferring one from
  pattern-matched corpus data has already produced a wrong answer once, which is
  why the `%%` rules in `corpus.ts` are recorded instead.

## Files

| File                    | Role                                         |
| ----------------------- | -------------------------------------------- |
| `corpus.ts`             | Deterministic case generator                 |
| `chain.ts`              | Pinned Quartz pipeline and feature profiles  |
| `normalize.ts`          | Our projections, from mdast                  |
| `types.ts`              | Shared projection and golden shapes          |
| `compare.ts`            | Diffing and gate policy                      |
| `oracle.e2e.ts`         | Recorder; runs inside Obsidian               |
| `parity.test.ts`        | The gate; no Obsidian required               |
| `goldens/obsidian.json` | Recorded output, version-stamped and triaged |
