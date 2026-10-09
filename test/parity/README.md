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

5. **probe** — a `probe/<question>/*` family enumerating one open question, added
   when a rule has to be settled rather than sampled. Each carries a comment
   naming the question, because a probe whose purpose is forgotten gets deleted.

Add a case by editing `SEEDS`, or a whole family by extending `TOKENS`,
`CONTEXTS`, or `ADJACENCY`. Re-record afterwards; new cases arrive as
`unreviewed` and the gate fails until they are triaged. Cases are deduplicated by
markdown, so a designed probe replaces an incidental fuzz case with the same source
— which is an improvement, and worth checking after a corpus change that no case
kept its id while changing content, since that would move a triage state onto a
different document.

### What five probe waves established, including where the heuristic ran out

Ranking families by open cases per designed probe reliably finds the ones **nobody has
examined**. It does not find the ones that are broken, and after five waves that
distinction is the finding:

| family           | probes | matched on arrival |
| ---------------- | -----: | -----------------: |
| escape `\`       |     19 |             **19** |
| strikethrough    |     13 |             **13** |
| math `$`         |     22 |                 21 |
| embed `![[`      |     18 |                 17 |
| tab              |     18 |                 16 |
| code run/context |     30 |                 19 |
| empty container  |     14 |                  9 |
| emphasis extent  |     13 |                  9 |
| footnote content |     12 |                  9 |
| thematic break   |     11 |                  5 |

Math had the worst ratio in the backlog by four times and came back 21 of 22. Escapes and
strikethrough were perfect. In every one of those cases the "open" count that selected
the family was made of fuzz documents carrying six other constructs, where the construct
named was never the cause.

**The families that did yield were not about a construct at all.** Empty containers,
emphasis extent, footnote content and the thematic break were each about an _interaction_
— a container that opens nothing, a fragment reparsed at the wrong boundary, a projection
reading a DOM the recorder had already edited, a tab changing which tokenizer claims a
line. A single-construct probe finds those only by accident, which is what happened here.

So the ratio is spent as a selector. What remains needs probes shaped around two
constructs meeting, or around a transform boundary, and the honest version of the
coverage table below is that it measures attention rather than risk.

### Co-occurrence frequency is a spent selector too

The ratio heuristic -- open cases per designed probe -- was already retired above. Picking a
probe axis by **what the failing cases most often sit next to** fails the same way.

Measured: of the wikilink cases still diverging, `](` was the commonest neighbour at 8 of
21, and of the 58 wikilink probes already here only **5** held a `](` at all. That reads
like a textbook gap -- the axis the failures concentrate on is the one nobody aimed at.

Fifteen probes crossing a wikilink with inline-link syntax came back **15 of 15 matching**
on the main gate. The co-occurrence was not causal: those fuzz documents contain a `](`,
but the `](` is not what is wrong with them.

What the family did find was on the **other oracle**. Three of the fifteen diverge on
`metadataCache` while matching the parity gate: Obsidian indexes an inline link whose
destination is a wikilink, or whose label holds an embed, as an internal link --
`[t]([[a]])` with target `[[a]]` and display `t`, `[![[a]]](u)` with target `u` and display
`a` -- and we index nothing, because the wikilink tokenizer claims the brackets before any
link node forms.

So the probe wave was worth running and the selector still does not work. Two lessons,
pulling apart:

- **Stop choosing axes by counting.** Both counting heuristics tried here -- probes per open
  case, and neighbour frequency -- have now produced near-perfect families. What has
  actually yielded every time is a _contradiction_: two recorded cases that cannot both
  follow from the same rule. `fuzz/contradictions.ts` reports them, and wants re-running
  after every landing: each one re-partitions the triage and can expose a shape that was
  uniformly diverging a moment ago.

  **And audit the detector itself.** Its skeleton collapsed adjacent `w`s across `\s`,
  which matches a line ending -- so `[foo]: /url` / `bar` / `===` / `[foo]` reduced to the
  same shape as `[foo]: /url` / `===` / `[foo]`, and it reported a contradiction between
  two documents that differ by exactly the line that decides the rule. Two such phantoms
  stood for a week and were quoted as blockers in two case notes. Narrowed to horizontal
  whitespace the detector reports **zero** at every width, which is the honest reading: the
  selector is spent for now, and each remaining case is its own rule with nothing in the
  corpus contradicting it. A selector that invents work is worse than one that finds none,
  because it also hides whatever it merged away.

- **Check every oracle before calling a family clean.** "15 of 15 matched" was true and
  incomplete; the gap was one `compute` counter away.

### Construct frequency is the third spent selector, and a base rate kills it

All three counting heuristics tried here have now produced near-perfect families. The third
is the most tempting, because the number looks enormous: of 129 causes a sweep reduced to,
`blockid` appeared in **67**, over half.

It means nothing without the base rate. `blockid` also appears in **785 of the 1000
generated documents**, so the conditional failure rate is 15.0% against a 13.1% base --
a lift of 1.15. The strongest lift in the whole table is 1.45. Dense fuzz documents carry
six to eight constructs, so nearly every construct appears in nearly every failure, and
frequency measures the generator rather than the parser.

| construct | in all | in failures | P(fail \| present) | lift |
| --------- | -----: | ----------: | -----------------: | ---: |
| setext    |    499 |          95 |              19.0% | 1.45 |
| highlight |    489 |          93 |              19.0% | 1.45 |
| math      |    555 |          97 |              17.5% | 1.33 |
| blockid   |    785 |         118 |              15.0% | 1.15 |
| wikilink  |    908 |         124 |              13.7% | 1.04 |

So: **compute a base rate before believing any count.** What still works is a
contradiction between recorded cases, and -- new here -- plain **minimality**. Picking the
shortest reduced forms a sweep produces found nine fixable rules in one wave, on the
reasoning that a seven-character document can only be wrong about one thing.

### A zero-regression measurement proves nothing if the corpus cannot adjudicate the rule

The sharpest lesson available, because it cost a shipped regression.

A tag was taught not to start after a label opener, so that ` ![[#t` would stop reporting
one. Measured with the usual delta tool: **zero regressions**. It was wrong anyway. Every
one of the fourteen recorded `[#` cases is a `[[#heading]]` wikilink, so no case in the
corpus held a bare `[#tag]` at all -- and `[#tag]`, `[#tag](u)` and `[#a/b]]` all report a
tag in Obsidian. Six of the next sweep's thirty shortest causes were exactly that shape.

A clean delta against a corpus with no case for the rule is not evidence, and it reads
exactly like evidence. Before trusting one, **count the cases that exercise the rule** --
a one-line predicate over `markdown` -- and if the answer is zero, the measurement has
told you nothing. This is the counting that _is_ worth doing.

Two smaller corollaries from the same night:

- **Check every oracle before calling a family clean**, now five instances. The newest is
  the inverse of the usual one: the main gate went _green_ on three `block-id-wrapper`
  cases while `compute` still reported `blocks: []` for all three, because the projection
  and the block scan are separate passes and `compareCase` reads only the first. A passing
  gate can be the misleading one.
- **When a rule looks inconstant, check whether the inconstant case is the same
  construct.** `sections` carried 139 divergences and the largest family in it was declined
  twice as the "definition start-column convention", because `    [^12]:` reports column 2
  where everything else reports 0. Four spaces is indented _code_ -- never a top-level
  paragraph, so never part of the family. Excluding it dropped the ceiling to 44.

### Coverage is not uniform, and the gaps are where the backlog lives

Measure it before concluding anything about a family's size. Counting designed
probes against incidental hits (fuzz and borrowed CommonMark cases):

| construct           | designed | incidental | open |
| ------------------- | -------: | ---------: | ---: |
| wikilink `[[`       |      149 |        281 |   51 |
| comment `%%`        |      130 |         46 |    8 |
| highlight `==`      |      102 |        187 |   18 |
| raw html tag        |       25 |        146 |   22 |
| tag `#`             |       12 |         35 |    2 |
| nested bracket pair |        3 |         27 |    6 |

Obsidian's own constructs are probed heavily; the borrowed ones are not, and that is
exactly where the remaining divergences sit. Two concrete costs of relying on
incidental coverage:

- The tag tokenizer had two independent bugs — a tab before `#`, and slash-shaped
  paths — found only because the fuzzer stumbled into them, behind 12 designed probes.
- Reasoning from **three** accidental nested-bracket cases, the raw-HTML/setext rule
  was written off as a tag-list problem needing a tokenizer port. 17 designed probes
  showed the tag is irrelevant and it was a bounded repair pass, which then landed in
  one commit. The probe that decided it was the one the first attempt lacked.

So when a family looks small or a fix looks too invasive, check whether the corpus
can actually adjudicate it first. And prefer measuring a blast radius to estimating
one: "6 cases at risk of breaking 21" was reasoning, not measurement, and it was
wrong — a rule both oracles agree on cannot break a case that already agrees with
Obsidian.

### An estimated blast radius cost three deferrals; the measured one was zero

Label precedence was declined three times on one number. A predicate counting corpus
cases with a nested bracket pair returned **369 `match` cases**, against ~24 to gain, and
that ratio read as obviously not worth it.

The predicate was an upper bound and nothing more. Shipping the rule behind
`labelPrecedence: false` and flipping it cost **0 regressions** for 9 cases, then 5 more
from the same scan. Every one of those 369 cases holds a nested pair; almost none holds
one where Obsidian and CommonMark disagree, which the predicate could not tell apart and
a one-line option could.

Two rules fall out, and they pull in opposite directions, which is the point.

**Put the rule behind a default-off option rather than estimating what it would break.**
It costs one option and one measurement, and it is the only way to tell a predicate's
upper bound from the real cost. The fuzz sweep is what made the attempt worth it at all --
the family is ~24 recorded cases and 39% of independently discovered causes.

**And measure the widening too, because a trigger that looks like the same rule is not.**
Firing the same scan wherever it finds a label the tree has no link for gains 8 and costs
**35**: a naive destination reader takes a title as part of the url, and a `[` belonging
to an image, a wikilink or a footnote reference is indistinguishable from one belonging
to a link. So "measure, do not estimate" does not mean the measurement will be kind.

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

## The backtick retry

CommonMark requires an inline-code closer of **exactly** the opener's length; with no
such closer the whole run stays literal. Obsidian instead **retries with a shorter
opener**, shedding backticks from the left down to the widest closer that does occur
ahead:

````
``code`          ->  `<code>code</code>            opener 2, closer 1: one literal tick
```code`         ->  ``<code>code</code>           opener 3, closer 1: two literal ticks
``a⏎b`           ->  `<code>a b</code>             the line ending becomes a space
````

A short opener never **grows**, which is the asymmetry that makes this a rule rather
than a tolerance: `` `code`` `and` `code``` `` stay wholly literal. And where a
closer of the opener's own width exists the retry never happens -- `` ``a` and ``b` ``
is stock behaviour, a code span holding ``a` and ``.

**Context is irrelevant**, which is the strongest evidence that it belongs in the
tokenizer rather than in any container's handling. All seven contexts probed render
identically to the bare case: emphasis, tight emphasis, strong, table cell,
blockquote, heading, list item and link label. Note the heading keeps the raw source
in its attribute while rendering the span -- `# ``code` `gives`<h1 data-heading="``code`">`, so `metadataCache` and the DOM disagree by design.

The implementation hazard is lookahead cost, and **a uniform-width probe will not
find it**. `` ` ``x20000 parses in 16ms bare and ` `a ``x7000 in 44ms, which reads
as linear and is not: a single run has nothing to rescan, and a document whose runs
are all width 2 lets every opener find its own width immediately. Both were recorded
here as a baseline and both were measuring nothing.

cmark's actual backtick pathology is run widths that **increase**, so no opener ever
finds its own width ahead and each one scans to EOF and fails. Stock micromark is
superlinear on it -- time grows as roughly bytes^1.5:

| runs `k` |     bytes |      bare |  ours | speedup |
| -------: | --------: | --------: | ----: | ------: |
|      250 |    31,625 |     283ms |  17ms |     17x |
|      500 |   125,750 |   2,084ms |  44ms |     47x |
|     1000 |   501,500 |  16,219ms | 155ms |    104x |
|     2000 | 2,003,000 | 130,322ms | 620ms |    210x |

Doubling `k` quadruples the bytes and **octuples** bare's time. Ours grows x4, exactly
with the bytes.

The retry is what fixed that, rather than merely surviving it. The openers stock scans
to EOF and fails on are _precisely_ the ones the retry must decide, so
`legacy-code-text.ts` settles them from a run index built once per text context, and
stock never runs the failing scan at all. `backtick-increasing` is gated at `k=2000`
**because** ours is fast there: losing the index puts it back at 132s against a 20s
budget, so the guard fails loudly rather than drifting quietly.

One caution the attribution exposed. ` `a `` x14000 is 110ms bare against 982ms
ours, and the retry construct accounts for **none** of it -- the same document with
`legacyCodeSpans: false` is 982ms too. That superlinearity is somewhere in the
transform chain, on a single paragraph holding thousands of inline spans, and it
predates this work.

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

### When `replicate` is the wrong state

`replicate` claims we intend to close the gap, so a case **no permissible fix can
close** does not belong there — left alone it blocks the backlog forever while looking
like ordinary debt. Moving a case out of `replicate` is only legitimate with an
impossibility argument attached; without one it is just hiding it.

**And the argument can be wrong.** This section used to carry the doubled
inline-footnote opener as its worked example, with an argument that read well: Obsidian
consumes `^[` and its `]`, emits no node, shows the body as literal text, so reaching
`match` would mean dropping those characters ourselves and a formatter would write them
out of the author's file. Eighteen cases were `report-upstream` on that basis.

The model was wrong. Obsidian is not dropping anything in `[^[^1]` — it is reading a
**reference** whose label runs to the first `]`, so the label is `[^1` and it renders as
its own bare text. Nothing is consumed that a formatter would lose, and the node
round-trips. Once `bracketLabelReferences` implemented the real rule, **17 of the 18
matched outright** and `report-upstream` went to zero.

So the standard holds — an argument is required — with one addition: an impossibility
argument rests on a model of what the other side is doing, and that model is the part
most likely to be wrong. Revisit the state whenever the surrounding rules change, and
prefer `replicate` while any doubt remains, because a `replicate` case that turns out
impossible costs one re-triage while a `report-upstream` case that turns out fixable
hides eighteen.

What the family looks like now: one case remains, `fuzz/inline-footnote/3`, where the
label sits behind a `#` heading marker inside a table cell and our marker offset parts
company with the source. It is `replicate`, which is what it should have been all along.

### One recording flake, with a signature worth knowing

Twice now a case has come back with a different `text` while its `html` was
**byte-identical**, and that combination is the tell: same DOM, different reading, so
the capture raced rather than the parse changing.

Both were the same shape — a pipe inside an inline construct inside a one-column
table, `| Math |`/`| --- |`/`| $|x|$ |` and `| Link |`/`| --- |`/`| [[Note|Alias]] |`.
Both reverted on the next recording, and the stable value is the correct one: the
delimiter declares one column, so the surplus cells are dropped.

So if a `match` case fails after a re-record, compare `html` first. Unchanged html with
changed projections is a flake — re-record and it will come back. Do not assume the
older value was right, though: `| $|x|$ |` arguably _should_ split into three cells, and
only the html settled which reading was real.

### The two sides must exclude the same things

The recorder reads `text` and `emphasis` off a **clone** with `.footnotes` removed,
because the renderer relocates every footnote body to a trailing section and comparing a
relocated tail against our in-place mdast proves nothing. `math`, `links`, `tags`,
`headings`, `tasks` and `highlights` are read from the undisturbed root and _do_ see
those bodies.

That asymmetry is deliberate and it has to be mirrored exactly. Our `emphasis`
projection walked into footnote definitions and inline footnotes, so it reported
`strong`/`em` that Obsidian not only did not report but could not: `^[*em*]` and
`[^1]: **strong**` were tracked as parity divergences for emphasis the other side had
already thrown away.

Three cases, and the general rule is worth stating because this is the fifth time one of
the harness's own asymmetries has been triaged as a package bug: **before implementing a
projection divergence, check what the recorder does to the DOM it reads that projection
from.** The answer is in `oracle.e2e.ts`, usually in a comment next to the `remove()`.

### A footnote label and a link label are different scans

Both are "find the closing bracket", and they do it differently, which is why label
precedence closed 30 cases without touching the footnote half at all.

A **link** label is found by balanced counting, so the outermost pair wins:
`[a [b](u) c](v)` links to `v`. A **footnote** label runs to the **first** `]`, with no
counting: `[^a[b]c]` renders `a[bc]`, which is the label `a[b` and `c]` left as text, and
nothing else explains that. Nine recorded labels agree -- a wikilink, an embed, an alias,
a heading, a bare pair, an inline link and an empty pair among them.

Nothing may parse inside either. For a link label that falls out of the scan ignoring
constructs; for a footnote label it has to be enforced, and that is what remains open.
Three attempts are refuted:

- Widening the label pattern in `footnote-bare.ts` costs **11 regressions** for
  whitespace -- which `hunt/invalid-name-rewritten-by-rules/0-5` was established for --
  and trips the ReDoS lint for brackets.
- Declining `^[` after a `[` in the inline-footnote construct costs
  `context/link-label/inline-footnote` and lets the **wikilink** win instead, so
  `[^[[a]]]` becomes a link to `a` where Obsidian reports the text `[[a]]` and no link.
- `labelPrecedenceTransform` cannot reach them: `claimedByOther` correctly declines a
  bracket a footnote reference already owns, and removing that guard is what cost 35
  regressions.

So it needs a construct claiming `[^` to the first `]` **before** anything else on that
bracket sees it -- competing with the wikilink extension, GFM's footnote call and
CommonMark's label start. `[` appears in 1517 corpus cases, so that is a measured piece
of work rather than a widening, and it is the last attributable group left.

### A rendered divergence can hide the character that caused it

`commonmark/links/507` reads `[link](/url "title")` and the two sides disagree about
whether there is a title. Three plausible projection bugs were investigated before a
byte dump showed the space is **U+00A0**: CommonMark says a no-break space is not
whitespace, so the destination really is the whole `/url "title"`, and Obsidian
treats it as a separator. Nothing was wrong on our side at all.

Every display in the chain renders it as a space -- the divergence report, a terminal,
`JSON.stringify`. So when a divergence makes no sense, dump the code points before
theorising:

```js
[...markdown]
  .filter((c) => c.codePointAt(0) > 126)
  .map((c) => "U+" + c.codePointAt(0).toString(16));
```

21 corpus cases hold a U+00A0 and the fuzzer put it there on purpose, so this is a
character the corpus deliberately exercises and not a transcription slip.

A second habit from the same episode: `pick.mts` truncates long markdown, and one of
those three false leads came from reading a truncated multi-link document as a
single-link one. Read the golden's own `markdown` before concluding anything from a
summary of it.

### Rewriting a golden from Python needs `ensure_ascii=False`

`json.dumps` escapes every non-ASCII character by default, and this corpus deliberately
carries CJK text, U+00A0 and a zero-width space -- so a one-field edit rewrote 1800 lines
into `\uXXXX` escapes. Prettier then accepted the result, because it is valid JSON that
parses to the same values, and the gate stayed green. Nothing was _wrong_, and the diff
was unreviewable.

Check `git diff --stat` after any scripted edit to the golden. A note change is one line;
anything larger means the writer re-encoded the file. `node -e` with
`JSON.stringify(g, null, 2)` does not have this failure mode, which is why the rest of
these notes use it -- but it has a different one: a backtick inside a double-quoted
`node -e` string is command substitution to the shell, and silently deletes the text
between backticks. Write the edit as a `python3` heredoc with quoted delimiters, or pass
the text through a file.

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

### Correcting one projection from the other renderer makes the golden unsatisfiable

The correction above writes Reading View's `text` into the golden and leaves every other
projection as the detached renderer captured it. When the two renderers disagree about the
**DOM** rather than only about display, that mixture describes no single rendering, and no
tree can match it.

`commonmark/html-blocks/171` is the worked example. `<textarea>` / blank / `*foo*` / blank
/ `_bar_` / blank / `</textarea>` records `text: "foobar"` from Reading View and
`emphasis: []` from the detached render, and those two cannot come from one DOM:

- `textarea` is RCDATA to the HTML **parser**. Feeding the renderer's own emitted markup —
  the raw `<textarea>` open tag, the two rendered paragraphs, then `</textarea>` — through
  `parse5` reproduces the stored html **byte for byte** and yields **zero** `<em>`
  elements. So `emphasis: []` is a swallow artifact, and that DOM's `textContent` is the
  literal `<p><em>foo</em></p> <p><em>bar</em></p>`, which is exactly what the full proxy
  check prints as `detached:`.
- Reading View's `foobar` therefore requires the `<em>`s to be **real elements**, so its
  emphasis is `["em:foo", "em:bar"]` — which is what we already produce, and what
  Obsidian's own `sections` agree with (html, paragraph, paragraph, html).

So the case is not parse debt, and the earlier note calling it an impossibility was
describing the harness rather than the parser.

Correcting the other projections too would fix that half. It would **not** make the case
comparable, which is the part worth knowing before attempting it: Reading View appends
block `div`s with no whitespace between them, so its `textContent` carries no block
separator — `foobar` — while the corpus-wide convention comes from the proxy's markup
newlines, where `aaa` / blank / `bbb` is recorded as `aaa bbb` and our projection matches
on 3302 cases. A corrected `text` is therefore only commensurable when the document
reduces to **one block**, which is exactly why the sibling correction
`hunt/blockquote-region-outlives-quote/1` (`after1`) is `match` and this three-block
document cannot be.

Adding separators to the Reading View capture would be adjusting the measurement to fit
our own output, so it is deliberately not done. `171` is `accepted` instead, with the
argument attached — our parse is right, both renderers agree with it, and only the two
captures disagree with each other.

The general rule: **a projection is only comparable against others captured from the same
DOM.** When the cross-check fires, either correct the whole capture or record the case as
a proxy divergence — never half of it. And **do not reach for the measurement when the
measurement is what disagrees with you**: the separator convention here could be changed
in one line to turn this case green, which is precisely why it must not be.

`fuzz/embed/64` is the other half of the same audit and went the other way. Its six
identical `$**strong**$` readings were recorded as a suspected detached-renderer
duplication; re-recording under `PARITY_FULL_PROXY_CHECK=1` kept all six, so the guess was
wrong. The html says what it is: six `internal-embed` spans, twelve `is-loaded`, **zero**
`is-unresolved`, with `alt=""` and `src=""`. The `![[ ]]` target collapsed to empty,
Obsidian resolved it to the current note, and embedded the note into itself six levels
deep. Reproducing that needs vault resolution and recursive inlining — the renderer's job,
and this harness models no vault.

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

### A parse fix can make the formatter corrupt the file

`shortCommentTransform` already knew that `<!-->` and `<!--->` are literal text to
Obsidian. It anchored its pattern (`^…$`), so it fired only when the html node was
_exactly_ one of those -- and micromark's comment scan runs to the **last** `-->` on the
line, so `foo <!--> foo -->` arrives as one node valued `<!--> foo -->` and was missed.

A prefix match plus restoring the space micromark drops before that node does reach
`match`, with no parity regressions. It is still wrong to ship. Converting the html node
to text makes `remark-stringify` escape the `<`, and re-parsing that escape grows another
backslash on every pass:

```
foo <!--> foo -->        source
foo \<!--> foo -->       once
foo \\\<!--> foo -->      twice
foo \\\\\<!--> foo -->     thrice
```

The round-trip ceiling caught it as a 33 -> 34 move. **One parity case does not buy a
formatter that grows the author's file every time it runs.** Reaching `match` here needs a
`toMarkdown` handler that writes the literal form first, which is the same thing the 33
remainder each need.

The sentence that used to sit here claimed the other 33 were "stable-but-unsettled, while
this one never converges". That was false, and it had been false for a long time -- see
below.

### The ceiling could not see the difference between untidy and unbounded

`once !== twice` is the wrong question asked for a long time. It cannot separate
"normalises one pass later than expected", which is cosmetic, from "rewrites the file
forever", which corrupts a vault on every save. Chasing the unstable set to a fixed point
instead -- twelve passes, since everything that settles settles on pass 2 -- found **13 of
the 41 never settled at all**, nine of them growing _exponentially_: a 48-byte definition
reaches 12,418 bytes in eleven passes.

So `raw-html/626` was being refused on a principle the harness was simultaneously
violating thirteen times, and the gate was green throughout. `roundtrip.test.ts` now gates
convergence separately from instability, which is the property a consumer actually needs.

Six of the thirteen were **one** bug. A `%%` inside a footnote definition was folded back
into the paragraph as a single text node holding the raw source slice -- including the
definition's own four-space continuation indent. The `footnoteDefinition` handler indents
that value again on the way out, so `    b` is written at eight columns; the leading space
of the doubled run is encoded as `&#x20;` to preserve it, and the `&` of _that_ is escaped
on the next pass. Four columns and a backslash run per round, forever.

The obvious repair is worse than the bug and the corpus said so immediately. Stripping the
indent out of one whole-span node converges, and costs `footnoteRefs` 3 -> 4 plus three
unplaced counters, because `hunt/obsidian-comments/23` carries a `[^2]` **inside** the
comment and removing four characters from a value whose position still spans them shifts
every offset derived from it. A wrong offset is worse than a missing one, so that version
does not ship.

What works is the idiom already in the repo twice: split on the line endings yourself and
give every segment its own exact span, with a `break` over each ending -- the reason
`legacy-scan.ts` gives every line ending its own token, and the reason
`blank-label-reference.ts` splits before `remark-breaks` can. `commentQuoteExtentTransform`
had been stripping `>` from its continuation lines for the same underlying reason all
along; it needs no spans only because it rebuilds a value the tokenizer owns.

13 -> 7 and 41 -> 35, with **0 parity regressions** and no ceiling moved on either
oracle. `join` was measured against this family first and is refuted: it is the only
`toMarkdown` hook aimed at block separation, pass 0 really does look like a missing blank
line between the definition and the following paragraph, and adding one changes nothing --
output is byte-identical at every pass, because the growth is inside the definition's own
serialisation. One more counting selector that read as evidence and was not.

All thirteen are now closed, and the gate asserts **emptiness** rather than a ceiling:
a formatter that never terminates is a defect and not debt, so there is no count to hold
a line at. The distribution is the part worth keeping.

**Four of the thirteen were one bug class**, and it is worth stating as a rule because it
recurred three times after being fixed once: **a raw source slice is the right source for
a node's `position` and the wrong source for its `value`.** A value is what the tokenizer
resolved; a slice is what the author typed, and the two differ by exactly the things a
re-parse would do again. The four were container indentation in `comment-in-definition`, a
bare `<` run in the html text projection, escape resolution in `inline-refold`, and escape
resolution again in the comment fold one function along. The tell is always the same shape:
output that is correct on pass 1 and grows on pass 2.

**Two were upstream**, and the cheap test that settles it is worth doing first: re-run the
input through bare `remark-parse` + `remark-gfm` + `remark-stringify` with none of this
package loaded. If it grows there too, it is not ours. That found the `<...>` autolink
shorthand being offered for an address CommonMark will not autolink, and an unclosed html
block whose span runs through its trailing line ending -- both at current versions, both
unreported, and both guarded here rather than repaired, since our package is what ships.

**One needed two sibling fields to disagree on purpose.** A relabelled reference's
`identifier` must stay raw and its `label` must be decoded: decoding the identifier
resolves `[bar][foo\!]` against `[foo!]` and turns a dangling reference into a link, which
`commonmark/links/545` catches, while leaving the label raw is what feeds the escaper a
backslash to double. Both fields carry a comment, because "fixing the inconsistency" in
either direction reintroduces one of the two defects.

And the ecosystem answer for literal content, since three local re-implementations had
already been refuted before it was looked up: **a handler's return value is appended
without passing through `state.safe`**, so returning a string is how content that must not
be escaped gets written -- `mdast-util-frontmatter`, `mdast-util-math`,
`mdast-util-mdx-expression` and `mdast-util-mdx-jsx` all do exactly that. `unsafe` cannot
express it, because `configure` only ever appends entries so an existing escape can never
be relaxed, and `state.safe` runs a backslash pass no pattern governs. Scoping with
`notInConstruct` cannot either: existing CommonMark entries do not name a custom construct,
and the test is a conjunction over the stack.

The dash boundary was worth measuring anyway, and the arbiter settles it: two dashes and
three are literal, **four** is a genuine comment with an empty body, five is literal
again. `commonmark/raw-html/625` is a separate half -- a `--` buried in a longer body
needs an unbounded scan on `<`, which is the quadratic shape `legacy-scan.ts` bounds
against (`<` x20000: 64ms to 16s).

### "A missing math handler" was the wrong diagnosis

Ten of the unsettled documents were written off as needing a `toMarkdown` handler that
writes the literal form -- the demoted `$$` is spelled `\$$`, then `\$\$`, and never
agrees with the source it came from. The mechanism for that is now known and documented
above: a handler's return value skips `state.safe` entirely.

Built, measured, refused. Returning the demoted value verbatim makes
`probe/math-unclosed/callout-title` **duplicate** -- `> [!note] $$` is written
`> [!note]` / `> $$` and then `> [!note]` / `> $$` / `> $$` -- because the bare spelling
re-opens the very construct the demotion undid. The escape is load-bearing, not spurious.

So the family is not a missing handler at all: **no spelling of these characters is both
what Obsidian renders and inert on re-parse.** The escaped form is stable and wrong about
the source; the literal form is right about the source and re-parses into something else.
That is inherent debt, and the honest ceiling is to carry it rather than to keep looking
for a handler. A fix that duplicates the author's text is refused even when it converges --
the same standard that refused `raw-html/626` for growing one.

### A `%%` comment hides at render time, not at parse time

`- %%` / `note%%` and `1. %%[` / `===` both render as nothing in Obsidian while we show
the body. The obvious reading is that the comment's span crosses the container's lazy
boundary, and `nonLazyContinuation` stops it -- so the construct was taught to absorb a
lazy line, gated on not having crossed a blank one. That reached 2 fixes and 0 regressions
on the main gate.

**The compute oracle refused it, on the very case it fixed.** Obsidian's own
`metadataCache` reports `fuzz/comment/13` as `list@0:0-1:3` with one list item spanning
both lines: the `===` is structurally inside the item, as a lazy paragraph continuation,
and the rendered text is empty anyway. So Obsidian parses the block and _hides_ it.

That is the governing rule restated from the other direction -- where Obsidian drops
source characters the drop belongs downstream -- and it says our structure was already
correct. Only `text` diverges, so the fix belongs in the projection: at render time `%%`
markers pair in source order, blind to block boundaries, and everything between an opener
and its closer (or end of note, when there is none) is invisible.

Three things worth keeping from the detour. The second oracle earned its cost here: the
main gate reported a clean 2-for-0 and the ceiling test is what caught the mechanism being
wrong. `afterLazy` committing an **empty** comment is load-bearing rather than sloppy --
making it decline instead costs 6 cases, four of them `probe/quote-comment/*`.

And the recorded text lives at `obsidian.projections.text`, not at `text`. A scratch script
read the shorter path, got `undefined` for every case, printed it as `""`, and that read as
"Obsidian renders nothing here" for nine cases at once -- including
`probe/definition-comment/blank-after`, which really wants `use⟨fn⟩`, and
`probe/straddle/callout-comment`, which really wants `b%%`. The conclusion above survived
only because it rested on `obsidian.compute`, which the same script read correctly. **A
field that does not exist reads as agreement with whatever you expected**, so print one
known-non-empty value as a control before trusting a scan built on a field path.

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

### References, once the definitions agree

Fixing the walk exposed the family underneath it: **1011** documents whose
definitions now agree _exactly_ while their references do not. It splits 809 "we
miss refs", 167 "we report extra", 27 both, and 8 same-name-different-column — so
missing references are the largest open ground in this corpus.

It is **not one rule**, and two attractive readings of it are already dead:

- **Not undefined references being dropped.** 1131 of the 1157 missed names are
  undefined, which looks decisive until you notice these fuzz documents define
  almost nothing, so it is true of most references whatever the cause. Tested
  directly instead: `text[^1]` with nothing defined still yields a reference node.
  It has to — dropping a dangling reference from the tree is the renderer's job,
  the same governing rule that keeps a surplus table cell and a colour marker.
- **Not blockquotes.** `> text[^1]` places its reference correctly, defined or not.

One narrow family _is_ confirmed, and recording it corrected the guess that led to
it. Eight `probe/reference-in-link/*` cases settle where a reference survives
inside a link construct, and the answer is **almost nowhere**: not in an inline
link's title, not in an image's alt text, not in a link reference definition's
title, and not in `[[^9]]`, which is a **wikilink** to `^9` exactly as we read it.

The rule they do establish is one thing seen from two sides — **a `[` right after a
link text's `]` opens a link label, so it is neither a wikilink opener nor the
start of a footnote reference:**

| input              | Obsidian                           | us                   |
| ------------------ | ---------------------------------- | -------------------- |
| `a [text][[^9]] b` | label `[^9]`, reference at `0:9`   | a wikilink to `^9`   |
| `a [text][^9] b`   | collapsed link, label `^9`, no ref | a reference at `0:8` |

So we miss one reference and invent another for the same reason. Both are tracked
`replicate` and enumerated in `KNOWN_REFERENCE_GAPS`.

Closing it means tokenizer precedence between the wikilink extension and
CommonMark's link label, not a repair pass over the tree — and the referee measures
the family at **44 of 6806 documents**, with the `][^` half appearing zero times
there. That ratio is why it is recorded rather than implemented.

A probe lesson worth keeping: the first recording of these eight cases defined
nothing, so every answer was an empty `footnoteRefs` that agreed with anything.
`footnoteRefs` lists only references whose name has a definition, so a probe for
reference behaviour **must define the name** or it proves nothing. The sibling
project hit the same wall and solved it differently, by re-parsing each note with a
synthesized definition for every undefined name and keeping whichever probe left
the note's own parse unchanged — which is what makes its `refs` field a real oracle
for undefined names, and the 1131 above real data rather than noise.

Grouping by the source line the missed reference sits on was too coarse to go
further, because a fuzzed document stacks many constructs and the per-line shape
attributes a miss to whichever construct happens to be on that line. A document
holding exactly one candidate construct is what the next pass needs.

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

## A container cannot be _prepended over_ the way a text construct can

Five cases closed by replacing micromark's `list` container, and the reason it had to be
replaced _whole_ is worth keeping, because the cheaper shape that works elsewhere in this
package does not work here.

The heading is deliberately narrower than it used to read. **Prepending** is what cannot
override a container; `disable` can, and the distinction took a separate measurement.
`disable: {null: [...]}` is honoured at `create-tokenizer.js:413` and so reaches container
constructs too -- verified for `list`, `blockQuote`, `htmlFlow` and `setextUnderline`. So
"replace it whole" is the right route for the _list_ rules below, and not a general law
about containers. What follows is about the prepend-and-decline shape specifically.

`legacyCodeSpans` and `legacyAutolinks` both prepend a construct that handles the cases
Obsidian reads differently and declines the rest -- and one of them goes further, consuming
its trigger character as **data** so the stock construct never sees it. Neither shape
transfers to a container:

- A container owns its own continuation. Once stock `list` opens an item, every later line
  is handed to **that construct's** `continuation` directly, not to the registered
  `document` map, and its `notInCurrentItem` retries stock `list` by direct reference. A
  declining construct therefore never sees the second item of a list stock opened.
- So the custom construct has to accept ordinary lists too, and the single structural edit
  in the port is that recursive retry: point it at the copy, or every divergence applies
  to the first item only.
- Repairing the tree afterwards is worse, not merely different. `lineOffsets` is populated
  from `listItemPrefix` and `listItemIndent` token exits, which happen **before** any
  transform runs, so synthesised list items would need a parallel set of hand-maintained
  offsets -- and a wrong offset is worse than a missing one.
- Mutating the exported construct object reaches every processor in the process, not just
  ours.

The procedure mattered as much as the route. **The vendored copy landed unchanged first**
and had to measure exactly 0 gains and 0 regressions before any semantics moved; that is
what distinguishes "the registration works and the copy is faithful" from "the extension
is silently not registered", which a neutral result looks identical to otherwise. Only
then did the digit ceiling come out -- and because it changed behaviour, it doubled as the
liveness check the neutral measurement could not provide.

Two corrections fell out. `)` was not a second divergence: micromark already accepts it,
and the nine-digit cap was the whole story for both long-marker cases. And
`commonmark/lists/313` was scheduled as a separate experiment on the assumption that an
under-indented continuation across blank lines needed legacy's whole-item minimum-indent
scan; the relative sibling-indent cap covered it.

What remains is genuinely harder, and both halves were predicted before the work started:
a tab-indented sibling, where `containerState.size` counts **characters** while
`factorySpace` consumes **columns** so `⇥ ` is two of one and five of the other; and an
under-indented continuation, which needs legacy's whole-item minimum-indent scan rather
than a different limit.

### The third shape: delegate to the stock construct with one flag suppressed

Between "prepend a construct that declines the rest" and "vendor the whole thing" there is
a cheaper route, and it has now shipped on both sides of the pipeline. Where our rule
differs from stock by **one decision** rather than by a whole algorithm, prepend a
construct that recognises only the triggering shape and then calls the stock construct's
own `tokenize` with the offending flag cleared.

`</pre>` is the worked example. micromark keeps `pre` in `htmlRawNames`, which governs only
_opening_ tags, and omits it from `htmlBlockNames` -- so a bare `</pre>` lands on block
type 7, which refuses outright when interrupting (`html-flow.js`: `self.interrupt && !lazy
? nok`). Obsidian's fork carries `pre` in its block-tag list, so there the closer
interrupts. The entire difference is that one `nok`, so
`src/lib/syntax/closing-pre-interrupt.ts` checks for `</pre` and hands off to stock
`htmlFlow` with `self.interrupt` saved and cleared, restoring it on both exits. Attribute
scanning and the blank-line continuation stay micromark's, which is also what makes the
block correctly absorb the rest of its line. Hand-rolling type 6 would have been ~60 lines
of duplicated scanning for the same result.

Two properties make it safe, and they are worth copying:

- **Engage only when the difference exists.** The construct returns `nok` unless
  `self.interrupt` is set, so every non-interrupting `</pre>` is tokenized by stock
  micromark bit for bit. The blast radius is zero by construction rather than by
  measurement.
- **A prepended flow construct that declines falls through to stock.** Verified
  separately: declining on `<` reaches stock `htmlFlow` normally. That is the same
  prepend-and-decline property the text constructs rely on, and it does hold for flow --
  it is only _containers_ it fails for, for the continuation reason above.

`mdast-util-to-markdown` has the identical shape and `defaultHandlers` is its name for it:
`src/lib/mdast/link-reference-to-markdown.ts` overrides one label spelling and delegates
everything else, after three attempts at reimplementing `linkReference` each cost different
cases, because `state.safe`, `createTracker` and the enter/exit stack are order-sensitive.
`task-char-to-markdown.ts` was already doing it before any of that was re-derived.

**When the difference is data rather than behaviour, skip the construct entirely.**
`textarea` is the counter-example in the same family: it is in `htmlRawNames` and Obsidian
predates its addition, so `<textarea>` swallowed every following block. There is no
decision to suppress -- the lists are module exports, and mutating one reaches every
processor in the process -- and the only thing the repair needs to know is that the type-7
boundary is the first blank line. `textarea-not-raw.ts` splits the node there and hands the
remainder back to the parser, which is far less code than a construct and gets Obsidian's
four sections exactly.

### A setext underline outranks a lazy continuation, but only for a quote

Seven corpus cases carried this shape and every reading taken from them was wrong. `> [!` /
`[[a|b]]` / `---` reports blockquote(line 0) then heading(1-2), so the lazy line is not
absorbed -- while `> [!no` / `===` reports **one** blockquote spanning both lines, so there
it is. The incomplete callout marker looked like the discriminator and is not: five cases
share it and one of those matches. `fuzz/setext/1` then ruled out the obvious replacement,
because there a _list_ absorbs its lazy line and the `---` becomes a thematic break.

Fourteen probes settled it, and it is **three** rules, which is why no single reading fit:

| input                       | Obsidian                                  |
| --------------------------- | ----------------------------------------- |
| `> a` / `b` / `---`         | blockquote(0) + heading `2:b`             |
| `> a` / `b` / `c` / `---`   | blockquote(0-1) + heading `2:c`           |
| `> [!note] a` / `b` / `---` | callout(0) + heading `2:b`                |
| `> a` / `---`               | blockquote(0) + **thematicBreak**         |
| `> a` / `===`               | blockquote(0-1), `===` absorbed           |
| `- a` / `b` / `---`         | list(0-1) + **thematicBreak**, no heading |
| `- a` / `b` / `===`         | list(0-2), `===` absorbed as text         |

1. A blockquote or callout gives up its **last** lazy line to a setext underline. An
   earlier lazy line stays in the quote, so only the line the underline touches leaves.
2. A **list never gives one up**. It absorbs the lazy line and the underline becomes a
   thematic break, or for `===` is absorbed as content.
3. When the underline _is_ the lazy line, the marker decides: `---` is a thematic break,
   `===` is absorbed. Only `---` has a second meaning, which is the whole asymmetry.

Eight of the fourteen matched on arrival. The six that did not are the two halves of one
inversion: we keep the lazy line for a quote where Obsidian hands it to a heading, and we
build a heading for a list where Obsidian does not.

The list half is the more interesting one to implement, because the cause sits **upstream
of every transform here**. Stock micromark already makes `b` + `---` a root setext heading
for `- a` / `<br>` / `b` / `---`, since CommonMark forbids lazily continuing a setext
heading into a list -- confirmed with `remark-parse` and `remark-gfm` alone. Drop the
underline and the same input leaves `b` a root paragraph that `containerLazyTransform`
absorbs correctly, which is exactly what makes it look like one of our own passes
misfiring. Closing it means `containerLazyTransform` accepting a `heading` as absorbable
**for a list only**, then splitting it back into the absorbed paragraph plus a thematic
break -- a quote must keep its heading at root, which
`probe/lazy-setext/quote-html-then-lazy` already matches.

This is the clearest instance yet of the rule that probes find _what_ while the fuzzer only
finds _that_. Three separate inferences from the same seven cases were each refuted by the
next case examined, and the family only became legible once the container type, the number
of lazy lines, and the underline marker were varied independently.

### The two list cases that did not close, and why they are different

Both were attempted rather than assumed, and the measurements are worth more than the
predictions were.

**The tab half, `commonmark/tabs/9`.** The cause recorded from the prediction was wrong:
it said `containerState.size` counts characters while `factorySpace` counts columns. The
real boundary is a threshold. Probing the third line of ` - foo` / `   - bar` / `<pad>- baz`:

| pad     | columns | our result         |
| ------- | ------: | ------------------ |
| `···`   |       3 | sibling of `bar`   |
| `····`  |       4 | sibling of `bar`   |
| `⇥`     |       4 | sibling of `bar`   |
| `·····` |       5 | nested under `bar` |
| `⇥·`    |       5 | nested under `bar` |

So we nest at five columns and `⇥·` is exactly five, while Obsidian puts `⇥·` below the
boundary. Note `bar` is itself a nested item whose own `size` is **2**, not 5, so the outer
list consumes three of the tab's four virtual columns and the inner item sees the
remainder: a tab straddling a container boundary gets **split**, and half a tab has no
character count at all. Comparing the indent unexpanded is refuted at **0 gains and 4
regressions** -- `task/nested-tab`, `document/tab-indentation`, `commonmark/tabs/4` and
`tabs/5` all need the column width for ordinary continuation.

**The under-indented half, `commonmark/list-items/257`.** `remark-parse@8` strips the
minimum indentation across the _whole item_, which a streaming tokenizer cannot see. Two
floors were tried and both are refuted, and together they pin the answer from both sides:

| floor                      | gains | costs                                             |
| -------------------------- | ----: | ------------------------------------------------- |
| one column past the marker |     1 | **1** -- `commonmark/list-items/276`              |
| the prefix width           |     1 | **7** -- including the staircase cases just fixed |

`-    foo` / blank / `  bar` must leave `bar` a paragraph of its own, and a nested item has
`initialSize` 0 so the lower floor swallows sibling markers. No constant satisfies both
cases, so this one genuinely needs the whole-item scan rather than a different limit.

The general point is the one the `%%` detour made too: **an attempt that fails with counts
is worth more than a prediction that sounds right.** The predicted cause for the tab case
was plausible and wrong, and only probing the threshold showed it.

## The legacy stack is an arbiter, not an oracle

Obsidian runs a **fork** of `remark-parse@8`, so a local install of
`remark-parse@8.0.3` + `remark-footnotes@2` + `remark-math@3` settles most
core-Markdown questions the recorded corpus cannot — but it is not the authority.
Where the two disagree, **the goldens win**.

That distinction is not academic; ignoring it cost a whole implementation. Stock
remark-parse 8 takes its escape list from `markdown-escapes`, whose `defaults` plus
gfm's `~` and `|` come to 18 characters, and the legacy stack confirms it character
by character: `a \& b` keeps its backslash there, where micromark escapes every
ASCII punctuation mark. Replacing micromark's `characterEscape` with that shorter
list produced **27 regressions and 0 fixes** — `\$`, `\==`, `\%%`, `\$$` and three
of CommonMark's own backslash-escape examples all stopped matching.

So Obsidian's fork escapes `$`, `=` and `%`, which stock's list excludes: its escape
set is CommonMark's, and ours already agreed. The 21 backslash cases that prompted
this have narrower causes — a wikilink's content and strikethrough's closing run —
not a global escape set.

Two lessons worth keeping. A rule the arbiter confirms can still be wrong about
Obsidian, so **measure before keeping, with regressions counted and not just
fixes**. And micromark's combined extensions **prepend**, so a construct returning
`nok` does not win — it falls through to the stock construct, which here undid the
entire change. `legacy-emphasis.ts` documents the same trap for attention.

## The fuzz sweep finds causes, not progress

`fuzz/sweep.ts` generates documents from a seed range, records them against Obsidian,
shrinks what fails, and groups by the reduced form:

```bash
nix develop -c /path/to/with-display.sh \
  npx tsx --conditions=development test/parity/fuzz/sweep.ts <from> <count>
```

The repo's `parity-record` cannot launch it — that wrapper forwards its arguments to
`npm run parity:record`, so they end up appended to the wdio command. A sweep needs
the Xvfb and window-manager setup without the recording command.

**Its agreement rate is not a progress metric, and treating it as one produced a
wrong number.** A generated document carries six to eight constructs and usually
several divergences, so fixing one cause rarely flips a document. Measured directly:
the same 400-seed range gave 272 agreements before a day's fixes and 272 after,
including a crash fix that removed five crashes outright — those documents simply
fail for other reasons now. Two different ranges gave 68% and 72%, which is range
variation and nothing else. Use the corpus match rate for progress; its cases are
small enough that one cause is one case.

What the sweep is genuinely good for is **triage**:

- **Crashes.** The parity gate only compares successful parses, so a stack overflow
  is invisible to it. A sweep found one in 55 of 4000 documents, which was the first
  crash any oracle here had surfaced.
- **Frequency.** 128 failures reducing to 118 causes says most are singletons, but the
  cluster of eight that landed on `| a ⏎| --- ` identified a table rule the corpus held
  as one unremarkable case. That is what tells you which "isolated fragment" deserves
  a probe family.

### The backlog does not need more fuzzing; it is already minimal

Asked whether the remaining cases were actionable or wanted another sweep, the honest
way to answer was to measure. Of 107 `replicate` cases:

| kind                                         | count |
| -------------------------------------------- | ----: |
| designed probe or borrowed CommonMark case   |    44 |
| fuzz document carrying one or two constructs |    30 |
| fuzz document carrying more than two         |    33 |

Thirty-eight of the 44 are CommonMark spec examples, which is the most isolated evidence
available anywhere, and 106 of the 107 already carry a recorded cause.

The 33 looked like the unattributable remainder, so `fuzz/shrink-corpus.ts` reduces them
-- the same shrinker `sweep.ts` uses, pointed at documents already recorded here rather
than at fresh seeds. **Thirty-one of the 33 were already minimal.** They reduce to 33
distinct forms, several of them ten to fifteen characters: `- [ ]⏎===`, `y^2$⏎$y^2$`,
`1. %%[⏎===`.

Two conclusions. A construct count is a bad proxy for attributability -- a rule can
genuinely need three constructs to show itself, and `- [ ]⏎===` is both dense by that
measure and perfectly isolated. And more fuzzing is the wrong instrument here: a sweep
generates documents carrying six to eight constructs, which is the category that looked
unactionable, while the ones already present cannot be reduced further.

So the remaining work is reading 107 small recorded cases, not gathering more.

### Group the reduced forms by _shape_, not by their text

Exact-string dedup is what the sweep prints, and after the shared rules were fixed it
says everything is a singleton: 1000 seeds gave 250 failures reducing to **244** distinct
causes, the largest cluster three seeds. An earlier sweep had 128 failures reducing to 118
with a cluster of eight, so the clustering has got weaker exactly as the big rules were
closed.

That reading is misleading, because the shrinker reduces to different literal text for the
same underlying rule. Classifying those 244 causes by shape instead:

| shape                                   | causes |   share |
| --------------------------------------- | -----: | ------: |
| label nesting, `[`…`[`…`]`…`]`          |     96 | **39%** |
| — of which doubled footnote, impossible |     16 |      7% |
| — of which a footnote label holds `[[`  |     19 |      8% |
| — other bracket nesting                 |     61 |     25% |
| unbalanced brackets                     |     56 |     23% |
| no bracket involvement                  |     91 |     37% |

So the remaining divergences are fragmented by text and concentrated by shape, and the
concentration is in the one family the corpus under-samples: bracket nesting is ~24
recorded cases and **39% of independently discovered causes**.

Only 4 of the 244 appear in the corpus verbatim, so this is new ground rather than a
replay of known cases — which is what makes the share meaningful.

A third thing it does not say: the **share is not a progress metric either**. The second
range was measured after all 14 label-precedence cases were fixed and still came back at
36%, three points off the 39% from before them. That is range variation, not a fix
failing -- the share describes what the generator produces, and 14 cases out of 3100
cannot move a 1000-seed distribution. It is the same trap as the agreement rate above,
one level up: use the share to pick a family, never to check whether the family closed.

Two things it does not say. A reduced form is one cause of its document's failure, so
closing the family does not flip 39% of documents. And 37% involve no bracket at all, so
a complete bracket fix still leaves a large, genuinely diverse remainder.

Two cautions. The reduced form is **a** cause of that document's failure, not the only
one — shrinking has drifted to a rarer cause every time it has been checked, so treat
a minimal form as a lead and confirm the rule with recorded probes. And a fixed
cluster disappears from later reports while its documents keep failing, which looks
like the fix not working until you test the minimal form directly.

## Files

| File                     | Role                                         |
| ------------------------ | -------------------------------------------- |
| `corpus.ts`              | Deterministic case generator                 |
| `chain.ts`               | Pinned Quartz pipeline and feature profiles  |
| `normalize.ts`           | Our projections, from mdast                  |
| `types.ts`               | Shared projection and golden shapes          |
| `compare.ts`             | Diffing and gate policy                      |
| `oracle.e2e.ts`          | Recorder; runs inside Obsidian               |
| `parity.test.ts`         | The gate; no Obsidian required               |
| `goldens/obsidian.json`  | Recorded output, version-stamped and triaged |
| `fuzz/contradictions.ts` | Shapes holding both a match and a divergence |
