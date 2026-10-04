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
from both sides when it is false. Recording against 1.14 or later sharpens the
math assertions with no code change.

## The math-content oracle

Dropping `tex` is not free: it left **seven wrong `$$` delimitations behind a green
gate**, agreeing only on the `display` flag. `$$x^2` is the clearest — stock
`mathFlow` follows the code-fence template, so the formula lands in the node's
`meta` (an info string, as a code fence's language would be) and the math body is
empty, while Obsidian renders `x^2`.

1.14 can see all seven, but it is not `latest`, so a full golden recorded from it
would make the weekly drift job fire. `goldens/math-content.json` is therefore a
second, separately stamped oracle holding only the math projection for the 76 cases
that involve math, and `math-content.test.ts` gates it with the same two-way policy
as the main gate: a `match` case that stops matching fails, and a `divergent` case
that starts matching fails so the backlog cannot rot. Every `divergent` entry
carries the root cause.

Re-record it against a 1.14 build, which needs `PARITY_GOLDEN_PATH` so the
committed gate is not overwritten:

```bash
OBSIDIAN_APP_PATH=~/.config/obsidian/obsidian-1.14.2.asar \
PARITY_GOLDEN_PATH=/tmp/golden-1.14.json \
npm run parity:record
```

then regenerate `goldens/math-content.json` from that file. Note the recorder
stamps `obsidian.app` from the running bundle's `apiVersion`, not from wdio's
version getters — those report the _installer_, so an `OBSIDIAN_APP_PATH` override
would otherwise label a 1.14 recording as 1.13.7.

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

Nothing is implemented yet, deliberately — 1.13.7 does **not** consume the
emoji, so stripping it now would be wrong for current Obsidian. The corpus
cases are the tripwire instead: they are recorded against 1.13.7 and will start
diverging the moment 1.14 becomes `latest`, which is precisely when the weekly
drift job should raise it.

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
