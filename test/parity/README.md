# Obsidian parity harness

This package exists to match Obsidian, including Obsidian's bugs. That claim is
only meaningful if it is measured against real Obsidian, so this harness renders a
generated corpus inside the actual application and compares the result to ours.

## Two phases

Recording needs Obsidian and a display. Checking does not, which is what lets the
gate run on every pull request.

| Command                            | Needs Obsidian | When                        |
| ---------------------------------- | -------------- | --------------------------- |
| `npm test` / `npm run test:parity` | no             | every push and pull request |
| `npm run parity:record`            | yes            | weekly schedule, or by hand |

`parity:record` boots Obsidian, renders all corpus cases, and rewrites
`goldens/obsidian.json`. The gate reads those committed goldens and compares them
against our own output. A full recording takes about 25 seconds.

## Running the recorder

Obsidian is an Electron app, so it needs a display even when nobody is watching.
Reading mode renders off `requestAnimationFrame`, which Chromium starves for
windows that are not mapped and focused — without a window manager the render
queue never drains and every capture comes back empty.

On NixOS, `nix develop` provides Node, `Xvfb`, and `herbstluftwm`, and wires up
`nix-ld` so the Obsidian binary that `wdio-obsidian-service` downloads can run:

```bash
nix develop
export DISPLAY=:99
Xvfb :99 -screen 0 1280x1024x24 +extension GLX -noreset &
herbstluftwm &
npm run parity:record
```

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

`corpus.ts` builds cases deterministically in four layers. Random input is useless
here because it essentially never lands on a delimiter boundary.

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

Two of these deserve explanation.

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

| State             | Meaning                                           | Diverging fails the gate? |
| ----------------- | ------------------------------------------------- | ------------------------- |
| `match`           | We reproduce Obsidian. This is the contract.      | **yes**                   |
| `replicate`       | Known gap we intend to close.                     | no                        |
| `report-upstream` | Obsidian bug we deliberately do not mirror.       | no                        |
| `out-of-scope`    | Another package in the chain owns this construct. | no                        |
| `accepted`        | Representations differ, output does not.          | no                        |
| `unreviewed`      | Newly recorded, not yet judged.                   | **yes**                   |

A `replicate` case that starts matching also fails, so the backlog cannot rot
quietly — re-triage it to `match`.

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
