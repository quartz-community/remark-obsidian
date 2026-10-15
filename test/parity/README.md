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

## Composition is the axis nothing tested, and it found a same-day regression

Every defect found here recently has been compositional rather than constructional: `- a` /
`lazy` / `[^1]: def` parsed correctly while `list` / `code` / `definition` did not, the comment
fold needed three changes at once with any one or two measuring as no change, the math
demotion looked like one defect and was three, and the tab rule is right in isolation and
wrong in documents carrying six constructs. `pass-order.mts` says the same thing about the
pipeline: 42 of 62 passes are position-sensitive.

The corpus tests a construct alone, a construct inside a container, and what follows an inline
delimiter. **It does not test one block construct followed by another.** `compose.mts` does:
every ordered pair of sixteen block constructs, adjacent with no blank line, then a blank line
and `use[^1]` so the footnote projections report something.

**256 sequences in four seconds, 14 diverging** -- and two of the fourteen were a regression
landed the same day. The `list`-after-`callout` absorption had been justified on one corpus
case, `probe/title-interrupt/two-lazy`, whose marker is `2.`; the sweep showed
`> [!note] title` / `- item` and `/ 1. item` both losing their `list` section, which Obsidian
keeps.

The discriminator was in the corpus case all along. CommonMark lets an ordered item interrupt
a paragraph only at **1**, so `2.` could not have opened a list and the line is lazy
continuation -- while a bullet or a `1.` can interrupt and is a real list. Restricting the
absorption to `start !== 1` fixes both, with 0 parity regressions and the referee unchanged at
78.9%.

Two things that matters for. **A rule justified on one case is scoped to that case's
accidents**, and the accident here was the marker's start number -- nothing in the corpus,
the referee, the compute oracle, or the invariant gates covered the composition that exposed
it. And the remaining divergences are pre-existing, in a dimension that had never been swept,
which is a better backlog than anything the referee's buckets still hold: each is two lines
long and one cause.

Working them down: **14 to 10 in two fixes.** A callout line after a list continues the list
exactly as a quote does -- the rule landed earlier the same day named only `blockquote`, and
a callout line arrives as its own node type, so `- item` / `> [!note] title` kept a separate
`callout` section where Obsidian reports one `list`. Same rule, two node types, found because
the sweep tries every pair.

The `X > comment` family is four of the remaining ten and needs TWO halves, which is why an
attempt at one of them is recorded in `comment-hoist.ts` rather than shipped. A column-zero
`%%` does not belong to the container above it -- the rule `definition-trim.ts` already
measures at ten against zero for a nested definition -- and lifting it out puts it in the
right PLACE while leaving its EXTENT wrong: an unclosed `%%` runs to the end of the note,
which a root `%%` already does here and a freshly lifted one does not, because the pass that
extends a root comment has already run. Position without extent costs one referee document
and changes no `compose` row, since each row is binary.

**That is the compositional lesson applied to the fix rather than the input**: two passes,
each correct, in an order that makes one of them useless. `pass-order.mts` reports this pass
position-sensitive, and the sweep is what made the coupling visible.

## Which constructs are KNOWN GOOD, and why the corpus cannot tell you

A fair question with a trap in it: if some constructs are fully correct, every divergence in
`A + B` is attributable to B or to the interaction, never to A -- so the unknown surface
shrinks. The trap is which instrument answers it.

**Not the corpus.** Of 3,403 cases, 5 do not match, so grouping cases by the constructs they
hold reports twelve constructs "clean" and the rest with one to three open -- and almost all
of that is absence rather than evidence. A construct is "clean" mostly because it does not
appear in those five documents. With a 99.85% match rate, per-construct cleanliness there is
nearly vacuous.

**`compose.mts` answers it properly**, because each of its 256 pairs names exactly two
constructs and every construct appears in 32 of them:

| construct                                                    |   as A | as B |  total |
| ------------------------------------------------------------ | -----: | ---: | -----: |
| comment                                                      |      0 |    4 |      4 |
| math                                                         |      0 |    3 |      3 |
| indented                                                     |      0 |    2 |      2 |
| thematic                                                     |      0 |    1 |      1 |
| bullet, ordered, quote, callout, linkdef                     | 2 each |    0 | 2 each |
| **heading, setext, fence, table, footnote, html, paragraph** |      0 |    0 |  **0** |

So **seven of sixteen are clean across all 32 of their compositions**, which is evidence
rather than absence. And the divergences are sharply shaped: every one is
`container > absorbable`, never the reverse, with the containers contributing nothing of
their own and the absorbables being `comment` (4), `math` (3), `indented` (2) and `thematic`
(1).

That reduces the open compositional surface to one question -- **how do `comment`, `math`,
indented code and a thematic break behave after a container?** -- over twenty pairs, ten of
which diverge. Against 1,482 referee documents whose largest demonstrated rule touches 67 and
breaks even, that is a far better-shaped target.

### ...and inserting a known-good spacer says it is container STATE, not adjacency

With seven clean constructs available as spacers, the discriminating experiment is
`container > spacer > absorbable`: 5 containers x 7 spacers x 4 absorbables, 140 sequences
rather than the full triple cross-product's 4,096. An ADJACENCY rule stops diverging once
something clean sits between; a container-STATE rule keeps diverging. That is the ambiguity
which cost four attempts on the comment fold.

**43 of 140 diverge**, against 10 of 256 for the pairs, and the breakdown is unambiguous:

| role       | counts                                                                              |
| ---------- | ----------------------------------------------------------------------------------- |
| container  | callout 13, bullet 10, ordered 10, quote 10, **linkdef 0** (of 28)                  |
| spacer     | footnote 12, setext 9, table 9, paragraph 9, html 4, **heading 0, fence 0** (of 20) |
| absorbable | **comment 18, math 16**, indented 5, thematic 4 (of 35)                             |

Three things fall out.

**It is container state.** The interaction reaches across every block the container can
absorb -- footnote, setext, table, paragraph, html, all of which `containerLazyTransform`
already accepts -- and stops dead at the two that END the container, `heading` and `fence`,
each at zero of twenty. So the absorbable is mishandled whenever the container is still open,
whatever sits between.

**`linkdef` is not a container.** It diverges in pairs and never in triples, zero of
twenty-eight, so a link-reference definition does not hold anything open; its two pair
divergences are about the definition line itself.

**The target is two constructs.** `comment` and `math` are 34 of the 43. So the whole open
compositional surface reduces to one question: **how do `%%` and `$$` behave after an open
container?**

That is the slimming the triangulation was for, and the arithmetic is worth stating plainly:
1,482 referee documents whose best rule touches 67 and breaks even, down to 20 pairs, down to
two constructs with a named precondition. Each case is three lines long and one cause.

### A target one instrument cannot see at all

Scoring the comment half before building it produced a result worth keeping, because it is
not a refusal:

| candidate                         | better | worse | verdict             |
| --------------------------------- | -----: | ----: | ------------------- |
| `container-comment-swallows`      |      0 |    10 | net -8              |
| `container-comment-swallows-defs` |      0 |     0 | **not adjudicable** |

The first drops every fact below the swallowing `%%`. All ten of its documents move the wrong
way, and in each one the DEFINITIONS are identical -- the entire loss is references Obsidian
still indexes below an unclosed opener. The second drops only definitions and touches
**nothing**: across 6,818 documents there is not one where this rule changes which definitions
exist.

So the comment family is **section geometry only**. The referee's oracle cannot see it by
construction, the same way four of the `UPSTREAM.md` defects cannot reach it, and the earlier
attempt's referee -1 was never evidence against the fix -- it was the reference half of a rule
that should only have touched geometry. A fix here is gated on `compose.mts` improving while
the referee and the corpus hold STILL, and nothing in it may drop a reference.

This is the first measured instance of a THIRD outcome from the scorer, which previously
reported only positive or negative. A rule that touches nothing is not a rule that failed; it
is a rule this corpus has no opinion about, and reporting that as "net negative" would have
read as evidence against it. `score.mts` now distinguishes four verdicts.

### It landed, and the gate caught the regression the prediction had excused

The fix is in `liftContainerComment`: a column-zero `comment` that is a container's DIRECT
child is lifted to root, its extent re-derived to the end of the note, and the siblings it
swallows become its CHILDREN -- the shape a root `%%` already produces, which is what keeps
every reference in the tree.

    compose pairs    9 -> 5  of 256
    compose isolate 35 -> 23 of 140
    referee         5379/6818, agreeing set BYTE-IDENTICAL to baseline
    corpus          0 regressions

**The first attempt measured referee -1, and it was a real regression -- not the noise the
section above predicted.** This is worth stating plainly because the prediction was mine and
it was wrong in the dangerous direction: having documented that this family cannot move the
referee, a -1 was exactly the number I was prepared to wave through.

`--ids` is what settled it. The summary says "78.9% became 78.9%", which cannot distinguish a
hold from a one-for-one trade, so `referee.mts --ids` now prints the key of every agreeing
document and the two dumps are diffed. The lost document was `probes.json#557`:

    > q / %% / [^1]: def / %% / blank / use[^1] use[^2] use[^3]

Obsidian buries that definition and indexes its label as a REFERENCE -- the
commented-definition rule, worth +123 documents. The lift broke it through a coupling nothing
documented: `commentRegionTransform`'s `rebuild` finds a closed region's host with
`from < start && to > start`, so it needs a root child STRICTLY CONTAINING the opener.
Lifting the comment to a root sibling starting exactly AT the region start, and shrinking the
container off it, leaves no such child, so the region is never rebuilt and the buried
definition goes live.

Testing closedness BEFORE the surgery fixes it, and the scoping is principled rather than
patched: an UNCLOSED comment needs the lift, because the tokenizer bounded its extent by the
container; a CLOSED region was already `commentRegionTransform`'s job.

Three things to carry:

- **A documented "this instrument cannot see it" is a reason to look HARDER at any movement,
  not a licence to discount it.** The write-up above is correct that the family is section
  geometry -- and the -1 was still a different rule breaking.
- **Verify a HOLD by identity, not by its total.** Two documents trading cancel perfectly in
  a net figure. Any fix whose predicted effect on an oracle is zero should diff that oracle's
  member set, which is one flag and one `comm`.
- **Put the dump in the real tool.** A reimplemented agreement test reads as independent
  confirmation while measuring something slightly different, so `--ids` shares the gate's own
  comparison.

## The absorption map: one bit per cell, including the cells we get right

The pair and isolate sweeps answer "where are we wrong". That is what a backlog needs and not
what a MAP needs -- "a list absorbs an unclosed `$$` and a quote does not" is the useful unit,
and it was only known because one cell had been chased by hand. `compose.mts --matrix` derives
it for every cell instead: 5 containers x 16 followers, **80 questions**, one bit per side.
`sections` is root-level, so a follower is ABSORBED exactly when no root section starts on its
line, and `R` means it kept its own section.

    follower   bullet ordered   quote callout linkdef
    bullet        A/A     R/R     R/R     R/R     R/R
    ordered       R/R     A/A     R/R     R/R     R/R
    quote         A/A     A/A     A/A     A/A     R/R
    callout       A/A     A/A     A/A     A/A     R/R
    heading       R/R     R/R     R/R     R/R     R/R
    setext        A/A     A/A     R/R     R/R     R/R
    indented      A/A     A/A     R/R    *R/A     R/R
    fence         R/R     R/R     R/R     R/R     R/R
    comment       R/R     R/R     R/R     R/R     R/R
    thematic      R/R     R/R     R/R     R/R    *A/R
    table         A/A     A/A     A/A     A/A     R/R
    math          A/A     A/A     R/R     R/R     R/R
    footnote      A/A     A/A     A/A     A/A     R/R
    linkdef       A/A     A/A     A/A     A/A     R/R
    html          A/A     A/A     R/R     R/R     R/R
    paragraph     A/A     A/A     A/A     A/A     R/R

### The list/quote asymmetry is a CLASS of exactly four, not four coincidences

These notes recorded it as "the third measured instance", then "the fourth", as though
instances were accumulating. They are one rule over one closed set. **`setext`, `indented`,
`math` and `html` are absorbed by a list and kept at root by a quote or callout** -- and
nothing else in the sixteen behaves that way. Every other follower is uniform across the four
real containers.

The rest of the map reads as four more rules, each now stated over the whole follower set
rather than inferred from whichever cell was being debugged:

- **Absorbed by nothing**: `heading`, `fence`, `comment`, `thematic`. These end any container,
  which is the same fact the isolate sweep found from the other side -- `heading` and `fence`
  as spacers diverge in 0 of 20.
- **Absorbed by all four**: `quote`, `callout`, `table`, `footnote`, `linkdef`, `paragraph`.
- **Same marker only**: a bullet list absorbs a bullet and a `1.` list absorbs an ordered,
  and crosswise both are `R` -- CommonMark's rule that a different marker starts a new list.
- **`linkdef` absorbs nothing**, confirming from a third direction that it is not a container.
  Its one `A` is `thematic`, because `[ref]: /url` / `---` is a setext HEADING.

### And it splits the divergences into three kinds, which the sweeps could not

When the matrix was built 5 of 80 diverged, and only **2** were absorption errors. The other
three had the absorption bit AGREEING and something else wrong, which a divergence flag cannot
distinguish. **All five are closed now** -- `matrix` is one of the four axes at zero -- but the
taxonomy is why they could be worked at all, so the table stays as it was measured:

| cell                 | kind       | obs                           | ours                                   |
| -------------------- | ---------- | ----------------------------- | -------------------------------------- |
| `bullet > math`      | EXTENT     | `list@0` + `paragraph@3`      | `list@0` -- we swallow the trailer too |
| `ordered > math`     | EXTENT     | as above                      | as above                               |
| `callout > indented` | ABSORPTION | `callout@0`+`code@1`+`para@3` | `callout@0` + `paragraph@3`            |
| `linkdef > indented` | NODE TYPE  | `definition@0`+`code@1`       | `definition@0` + `paragraph@1`         |
| `linkdef > thematic` | ABSORPTION | `heading@0` (setext)          | `definition@0` + `thematicBreak@1`     |

So the two `math` rows are not "we fail to absorb" at all -- both sides absorb, and we then run
past the blank line. That is `math-outlives.ts`, which eleven cases depend on, and it is a
different piece of work from a guard list entry.

Each kind needed a different fix, which is the taxonomy earning its keep:

| kind       | closed by                                                                   |
| ---------- | --------------------------------------------------------------------------- |
| EXTENT     | `mathListExtentTransform` -- a new pass bounding `$$` at its blank line     |
| ABSORPTION | `quote-indented-code.ts` accepting `callout`, re-running `calloutTransform` |
| NODE TYPE  | `definitionIndentedCodeTransform` -- a new pass, not a guard                |

Not one of the three was a guard-chain entry, which is the opposite of what the map's own
section predicted -- worth knowing before reaching for the chain on the next cell.

`linkdef > thematic` is the one worth re-reading, because the taxonomy called it ABSORPTION
and that was **wrong**: `definitionSetextTransform` already implemented the rule and was
declining the case on NODE TYPE, since `===` has no second reading and arrives as paragraph
text while `---` arrives as a `thematicBreak`. A cell's kind is a hypothesis like any other.

### The map is the specification the guard list never had

`containerLazyTransform`'s chain was built one entry at a time, each justified on the case
being debugged -- which is exactly the shape these notes warn about, a rule scoped to one
case's accidents. Audited against the map, its net behaviour agrees in all 78 undisputed
cells, including the entries whose restriction to `list` now reads as the asymmetry class
rather than as four separate judgements. Two notes for anyone extending it:

- Some cells agree through a DIFFERENT mechanism than the guard list. `quote > quote` is `A/A`
  while the guard admits a `blockquote` only after a list, because ordinary CommonMark lazy
  continuation already handles it in the tokenizer. The map measures the NET result, which is
  the thing that matters, and it cannot attribute a cell to a pass.
- `heading` is absorbed by the pass and then split back into a paragraph plus a thematic
  break, so the map's `heading R/R` is the correct net outcome of an intermediate absorption,
  not evidence the entry is unused.

### The other axis: what each block does INSIDE each container

`--matrix` maps adjacency. `--inside` maps its complement, 4 containers x 16 blocks with the
container's own prefix on every line of the inner block, and there is no absorption bit to
derive -- a block inside a quote is not a root section at all -- so the comparison is the full
projection equality the pair sweep uses.

The corpus samples this axis without ever tabulating it. `CONTEXTS` splices constructs into
containers by construct rather than as a complete table, so a cell nobody thought to sample
has always been indistinguishable from one that works.

**2 of 64 diverge, and both are one cause**: a `---` or `===` inside a callout. Micromark
reads the title line plus the underline as a SETEXT HEADING, so `calloutTransform` -- which
requires `children[0]` to be a paragraph on the quote's first line -- declines, and the
callout degrades to a plain blockquote:

| input                                  | Obsidian      | ours           |
| -------------------------------------- | ------------- | -------------- |
| `> [!note] title` / `> ---`            | `callout@0-1` | `blockquote@0` |
| `> [!note] title` / `> ===`            | `callout@0-1` | `blockquote@0` |
| `> [!note] title` / `> body` / `> ---` | `callout@0-2` | (agrees)       |

Five controls against live 1.14.4 pin the rule, and the important one is the NEGATIVE: a
setext underline inside a container produces **no heading at all** in Obsidian. `> text` /
`> ---` reports `blockquote` with `headings: []`, and so does `- item` / `  ===`, while a
root `title` / `===` reports `[["title", 1]]` -- so `headings` is a working oracle for this
and the absence is real rather than the field being empty.

That half we already get right, in the PROJECTION rather than the tree: `normalize.ts`
records that Obsidian renders a heading inside a container and does not index it, so our
projection drops a `heading` node our tree keeps. AST represents source, projection
represents rendering -- the governing rule, holding here without any change.

So the callout degradation is the whole of it, and the fix belongs in `calloutTransform`'s
first-child test rather than in setext handling.

### Widening an oracle that finds nothing is still worth the run

`compose.mts` compared `defs` and `sections` only. These notes carry five instances of a
family read as clean because one projection was never compared, so `headings` was wired into
all four sweeps.

It adds **zero** divergences -- inside 2, matrix 4, pairs 4, isolate 20, identical to before.
That is a confirmation rather than a find, and it is the result worth having: the heading
projection agrees across all 540 sequences in this space, including the container-nested
heading rule above.

It cost one near-miss on the way. The first version formatted Obsidian's side as
`level:name` while ours carries `level:name@line:col`, and reported **52 phantom pair
divergences** -- the goldmark `tasks` trap inverted, where a mismatched projection reads as
total disagreement rather than as agreement. Inspecting one row rather than believing the
count is what caught it, and the honest tell was that `heading > heading` cells were
diverging, which no plausible rule explains.

**And the edit that was supposed to fix it silently did nothing.** A `python3` replace matched
a multi-line string prettier had already collapsed to one line, printed success, and left the
old format in place -- so the corrected run reproduced the same 52 exactly and read as "the
format was not the problem". That is the seventh silent miss of this kind here. **Use the edit
tool for prettier-formatted text**, and when a fix changes a count by nothing at all, check
that the fix is in the file.

## Nesting: the inside half changes nothing, the after half changes four rules

`--nested` runs six container pairs -- `> >`, `> -`, `- >`, `- -`, `> > [!note]` and
`> [!note]` over `> >` -- against all sixteen followers, in both halves of the axis: `[ B ]`
puts the follower inside the innermost container, and `> B` puts it at column 0 after the
nesting. 192 sequences.

**The inside half is clean on arrival: 0 of 96.** Every rule `--inside` establishes at one
level holds at two, including `- - item` whose inner content column is four and therefore
collides with the indented-code threshold. That retires an axis rather than opening one, which
is worth as much here -- the corpus reaches nesting only incidentally, so "nesting is fine"
was an assumption with nothing behind it.

**The after half opened 13, in four families**, and this is where a depth-one rule genuinely
breaks:

| family                       | cases | what it is                                               |
| ---------------------------- | ----: | -------------------------------------------------------- |
| `nested > comment`           |     5 | the lift found nothing, because it looked one level deep |
| `nested > setext`            |     4 | correct at depth ONE and wrong at depth two              |
| `nested > math`              |     2 | the known extent bug, unchanged by nesting               |
| `quote > callout > footnote` |     1 | definition column 2 against our 0                        |

The comment family was `liftContainerComment` not recursing: `> > quote` / `%%` and
`- - item` / `%%` put the comment in the INNER container, so a quote's own children and a
list's last item both come back empty. Searching to any depth and shrinking EVERY ancestor on
the way out -- deepest first, so each shrinks onto a child that already has -- closes all five
and takes the referee to **5389/6818, +3 with nothing lost**. That is the "extend an
already-measured rule to a new input class" shape these notes record as the one that lands.

**`nested > setext` was the find, and it is closed.** At depth one `quote > setext` is `R/R`
and agrees; at depth two, `> > quote` / `title` / `===` reports a ROOT `heading@1` in
Obsidian -- with `headings: ["1:title@1:0"]`, so it is indexed, unlike every setext INSIDE a
container -- and we absorbed both lazy lines into the quote and reported no heading at all.
Obsidian's answer is IDENTICAL at both depths, so the depth-sensitivity was entirely ours.

Two causes, both the same shape as the comment lift beside it:

- `lastParagraphHost` returned the container itself, so at depth two it found the INNER quote
  as the last child, failed its paragraph test and declined the whole pass. It now descends.
- The quote-marker strip removed ONE marker per line where a nested quote spends two, leaving
  a stray `> ` in the rebuilt paragraph. A counting loop, since `(?:>[ \t]?)+` is a
  quantifier inside a quantifier and the ReDoS lint rejects it.

Four of the six nestings showed it, and closing it took `--nested` from 7 to **3** with the
referee unmoved and no corpus regression.

So the axis reads: **the inside half needed nothing, and the after half needed two
recursions.** Three of the four families it opened were rules already known and only
mis-scoped by one level of depth; neither was a new rule about nesting, which is why the
inside half was clean. The three cells left are the two `nested > math` extent rows and one
definition column.

### What the four axes cost and found, end to end

| sweep            | sequences | opened | now   |
| ---------------- | --------: | -----: | ----- |
| pairs            |       256 |     14 | **0** |
| `--matrix`       |        80 |      5 | **0** |
| `--inside`       |        64 |      2 | **0** |
| `--inline`       |       196 |      1 | **0** |
| `--isolate`      |       140 |     43 | **0** |
| `--nested`       |       192 |     13 | 1     |
| `--inline-block` |       224 |      4 | 4     |

**SIX of the seven axes are at zero, and the LIVE BACKLOG IS NONE.** `--inline-block` sits at
its floor rather than open -- all four of its rows are the P1 cache defect and MUST NOT be
fixed -- and the single `--nested` row is scored both ways and declined. So every composition
row that remains is one this harness has decided not to close.

The isolate axis went **43 to 0**, and the last twelve of that came from one insight, worth
stating because the entries had been filed as two separate families with two separate causes
and one of them written off as tokenizer-level work: upstream spans the SPACER over its
continuation line, so the third line of `container / spacer / absorbable` sits inside the
spacer where no absorption guard can reach it. Splitting the spacer at its own line hands each
tail to the rule that already governs it. Two spacer types, `footnoteDefinition` and `html`,
and the per-type guard was right all along -- `--matrix` has been clean at 0 of 80 throughout.

Splitting alone was not enough twice over, and both gaps were about a FRAGMENT RE-PARSE not
seeing the document. An unclosed `%%` tail needs the end of the note, which a two-character
re-parse cannot know. And the head definition has to be FOLDED for a list or a quote, where
Obsidian reports `defs []` against a callout's `1@1:0-1` -- `footnoteInterruptTransform` does
that fold and was declining because it read adjacency from LINE numbers while the splitting
pass moves nodes by offset, leaving every line at 1. Those two fixes are useless apart and
were measured together.

FIVE refutations on the way to it, each from a different instrument and not one able to find
what the others found: `score.mts` killed the premise "a definition inside a container" (495
worse, because a PREFIXED definition is genuine container content), the compose gate killed
the container scoping (13 to 14, because a quote and a list need the flattening too) and then
the tail scoping (an even trade, because a list absorbs everything in the asymmetry class),
the corpus killed the gap character class (four cases, because a definition inside a quote
carries `\n> ` in the gap), and the referee's `--ids` diff killed the callout scoping (3 lost
behind a total that read as unchanged, because
a callout with a BODY reports no definition at all). A fourth came from the gate again: the
split must fire only where the tail becomes a ROOT block, or a list's html spacer trades
`html > comment` for `html > math` at no net gain.

Every fix that landed from them extended a rule already measured to a node type or a nesting
depth it had not been scoped for -- a callout where a quote was named, a callout where a
blockquote was named, an inner container where a root child was assumed, twice. Not one was a
new repair for a new shape, which is the distinction `score.mts` exists to enforce and the
reason these landed at zero corpus cost and +10 referee documents with nothing lost.

## Score a rule before building it, because repairs lose and extensions win

A measured pattern in what succeeds here, and it is not about effort. Every change that
landed extended an ALREADY-MEASURED rule to a new input class: `referenceLinks` was right on
110 of 111 cases before a line was wired in, the container-lazy fix added two entries to an
existing guard list, the definition-column rule gained a second node type. Every change that
was refused added a NEW REPAIR for a single observed shape, and each scored `+1 corpus case`
against `-4` to `-27` referee documents.

That is structural. A repair that fires on one shape fires on many shapes in documents
carrying six or eight constructs, so the blast radius is always larger than the thing
measured. The standing rule here -- measure a predicate on both sides before implementing --
was being applied to CASES rather than to the implementation's blast radius.

`score.mts` closes that. A candidate rule is written as a transformation of OUR OWN ANSWERS,
applied to all 6,818 documents, and scored by whether each document moves toward the recorded
answer or away from it. No tree surgery, no pass ordering, no re-parse, and it cannot be keyed
wrong the way a disagreement table can.

Its own control is the two most recently refused rules, and it reproduces both:

    quote-truncate   better 61  worse 351  same 107   agreement 5336 -> 5095
    comment-fold     better  9  worse  18  same  11   agreement 5336 -> 5333

The tab work cost three implementation cycles and the comment fold four to reach conclusions
this gives in one run.

**And it reports what no implementation measurement can: a rule's CEILING.** `comment-fold`
changes 38 documents of 6,818, so its best possible outcome was +9. Four cycles were spent on
a rule that could never have been worth more than nine documents. **Read the
`better + worse + same` total first** -- if it is small the rule is not worth building however
the sign comes out, and that is the question implementing a pass can never answer in advance.

Two consequences for how the remaining work is chosen. The unit is now a RULE WITH A MEASURED
BLAST RADIUS, not a diverging case -- a single case is only ever a lead toward one. And a rule
that is CORRECT and scores negative is a real outcome: record it with its score and leave it,
rather than retrying it at a different scope, which is what three tab scopings and four
comment-fold iterations each established the expensive way.

### Nine candidates scored in one run, and what the ceilings say

With the unit changed from cases to rules, the obvious next question is which bucket contains
a rule worth building. Nine candidates, one run, no parser change:

| candidate                                                | better | worse | touched |
| -------------------------------------------------------- | -----: | ----: | ------: |
| `refs-drop-undefined` -- an undefined name is not a ref  |    124 |  5116 |    5300 |
| `refs-add-bare` -- every `[^x]` outside a label is a ref |    117 |  3266 |    3429 |
| `drop-defs-in-fence` (naive fence toggle)                |    103 |   137 |     246 |
| `drop-defs-in-comment` -- buried definitions dropped     |     85 |   218 |     309 |
| `quote-truncate`                                         |     61 |   351 |     519 |
| `tab-marker-defines`                                     |     24 |   114 |     138 |
| `defs-end-before-opener`                                 |      8 |    67 |     102 |
| `tab-marker-column`                                      |      0 |     0 |   **0** |

The two largest ceilings are unreachable and say so loudly. `refs-drop-undefined` breaks
5,116 documents, which is the governing rule here stated in reverse -- a dangling reference
stays in the tree, because dropping it is the renderer's job -- and `refs-add-bare` breaks
3,266, so we are not systematically missing bare references either. Both were worth one run
each to rule out.

**`drop-defs-in-fence` is the one with a real ceiling, and fixing its own detection halves
it.** A naive toggle on any backtick run scored 103 against 137; CommonMark's actual rules --
the closer matching the opener's character, at least its length, carrying no info string, and
an opener under four columns of indent -- score **32 against 32**, with the touched set
falling from 246 to 67. Exactly break-even, which means the 137 was mostly my detection
rather than the rule.

**And stripping the container prefix, the obvious next step, scores worse.** A fence opened as
`> 1.    ``` ` inside a callout's list item reads as four columns of indent when only the `>`
run comes off, so taking the list marker too looks right -- and it moves 32/32 to **84 better
against 100 worse**, because it then finds fences on lines that are not fences and drops
definitions that should stay. The detection has a sweet spot and that is past it.

So the best achievable score for the largest remaining rule is **exactly break-even**, over
67 documents touched. Four scopings were tried: naive (103/137), CommonMark fences (32/32),
CommonMark plus container prefix (84/100), and back. There is no narrowing in this family that
is net positive.

That is the finding, and it is about the oracle rather than this rule: **no remaining referee
bucket contains a rule worth building.** The buckets are 300-400 documents each; the largest
demonstrated rule inside any of them touches 67 and breaks even. They are a long tail of
context-specific interactions, which is consistent with everything else measured here -- the
tab family being a correlate rather than a cause, four counting selectors dying, and
line-local groupings refuting on contact.

What that implies for the referee as a target: 78.3% is close to what this approach yields,
on an oracle whose own comparison is looser than ours in three documented ways. Further
progress wants a different kind of evidence -- recorded probes against the application for
specific constructs, which `ask.mts` now makes cheap -- rather than more mining of this
corpus.

### ...and that conclusion was WRONG, because of how the buckets were grouped

The paragraphs above are kept because the reasoning in them is sound and the conclusion is
not. "A long tail of context-specific interactions" was inferred from grouping the disagreeing
documents by their TEXT -- minimal forms, line shapes, construct frequency -- and every such
grouping did refute on contact. Grouping them by WHAT DIFFERS gives the opposite answer.

The signature is counts and deltas only, never anything document-specific, so two notes sharing
a mechanism share a signature whatever text they carry: which definitions are missing or
invented, by how many lines each end is out, whether a column differs, and the same for
references. Over the disagreeing documents:

|                             |         |
| --------------------------- | ------: |
| disagreeing documents       |   1,415 |
| distinct delta-shapes       |  **72** |
| share in the top ten shapes | **82%** |

    235  ref-miss                 107  def-end+1
    190  ref-extra                 87  def-col
    140  def-miss                  68  def-miss+ref-extra
    125  def-extra+ref-miss        57  def-end-1
    123  def-extra                 32  def-end+2

That is structure, not a tail. And two of the families are purely POSITIONAL -- `def-end±N` is
213 documents and `def-col` 87 -- which means a single mechanism each rather than a cause per
document.

**The first lead from it landed immediately.** `score.mts` predicted better 48 / worse 0 for
pulling a definition's end back off trailing blanks, and the implementation delivered referee
**+36 with zero documents lost** -- the largest move on this oracle since the +43
lazy-absorption rule. It was not even a new rule: `definitionTrimTransform` already carried it
and applied it once, declining its blank loop whenever the end line held content and then
exposing blanks with its own fallback.

**And the metric is worth only 2.4 points, measured rather than estimated.** Implementing their
comparator against our tree -- column never compared, both ends normalised, empty and inline
references dropped -- gives 5,568 of 6,818 against our strict 5,403. So of the ~20-point gap to
their reported 99.2%, about 2.4 points is the comparison and the rest is real.

The lesson is about grouping rather than about the referee: **a selector over the INPUT and a
selector over the ERROR are different instruments, and this file had only ever tried the first.**
Four text-shaped selectors died here -- probes per open case, co-occurrence, construct
frequency, line-local prefix -- and each death was recorded as evidence that the remainder was
unstructured. It was evidence that the remainder is not structured BY TEXT.

### Re-asking a refused rule with the tree is not a universal fix

The lazy-continuation rule flipped from -15 to +21 once `score.mts` could read the tree, so
every rule refused on a line-scan approximation was worth re-asking. The tab rule is the
control that says when it helps.

Asked of the tree -- the shape being a `code` node INSIDE a `listItem` whose marker separator
holds a tab, which is exactly what micromark produces for `+⇥   [^1]: def` and exactly why no
definition is reported -- it scores **24 better against 25 worse, agreement +1**. The line-scan
version was 10 better against 14. So the tree sharpened it slightly and did not unlock it.

The reason is visible in the two documents it still gets wrong, which fail in OPPOSITE
directions: one wants the definition's end at the label's own line, the other wants it
extended over a following indented line, and the tree encodes neither -- the end is something
Obsidian computes and our tree does not record. Fixing the end for one breaks the other.

So the distinction is about WHAT was missing. The tree supplies container structure, which is
what "does this line continue that item" needed. It does not supply a boundary Obsidian
derives differently, which is what the tab rule's `endLine` needs. **Re-ask with the tree when
the missing information is structural; expect nothing when it is a value neither side records.**

### Its first real use retired the 426-document tab family

The tab family was the largest localised group on this oracle and the last candidate big
enough to justify construct-level work in `legacy-list.ts`. Scoring it instead of building it
took six runs and no parser change:

| candidate                                                | better | worse | touched |
| -------------------------------------------------------- | -----: | ----: | ------: |
| `tab-marker-column` -- the column behind a tab separator |      0 |     0 |   **0** |
| `tab-marker-defines` -- a label there defines            |     23 |   114 |     138 |
| ...end absorbing to the blank line                       |     24 |   114 |     138 |
| ...marker at column 0 only                               |     10 |    60 |      70 |
| ...and the separator starting with the tab               |     10 |    16 |      26 |
| ...and fence interiors excluded                          |     10 |    14 |      24 |

Each narrowing came from an example the previous scoping made worse, which is the loop the
harness is for -- an indented `  2)⇥[^Note]:` nested in another item, a `+ ⇥[^Ω]:` whose
space-then-tab was already measured as defining nothing, and a label inside an unclosed
` ` ```` fence.

**Two findings, and the second is the one that matters.** The column rule is already complete:
`tab-marker-column` touches ZERO documents of 6,818, so nothing we place behind a tab
separator sits at the wrong column. And the defining rule caps at **ten documents** -- 24
touched at its narrowest, 10 of them better. It is still net negative, and even a perfect
version could not be worth more than ten.

So the 426-document tab family is a CORRELATE, not a rule. A tab marks a document as hard --
that is what the base-rate test showed, P(disagree | tab) 30.5% against 14.8% -- and the
actual tab rule underneath it is worth ten. Construct-level work in `legacy-list.ts` was about
to be justified on the 426, and the ceiling says it should not be.

That is the most expensive mistake this harness has prevented, and it cost six scoring runs.

## A night on the queue: 5502 to 5520, and what the shapes actually hold

Worked with the instruments finished the day before, so every change has a blast radius and a
`still wrong` bucket rather than a total. Four landings, four refutations, one measured lead.

| landed                                            | referee |  corpus |
| ------------------------------------------------- | ------: | ------: |
| de-indented item's CODE THRESHOLD (B3's half two) |      +5 | 4 fixed |
| a footnote definition is a HOST for one inside it |      +6 |       0 |
| a `%%` indented four columns is CODE              |      +7 |       0 |
| a TITLE-LESS callout interrupts for `2.`          |       0 |       0 |

And refused, each with numbers in `score.mts`: `def-end+1`'s tab continuation (17/44 then
12/39), the ASCII-whitespace definition name (right by probe, 3 documents, unexplained
discriminator), the wide-separator item content (11/97, 0/3, 31/351), and B3's minimum as the
rule deciding which lines continue an item -- which failed in the TOKENIZER at -32 referee and
four CommonMark list cases.

### Three lessons, and the first cost two hours

**`shapes.mts` prints `obsidian -> ours`, not `ours -> obsidian`.** I read it backwards for the
first three candidates of the night, which inverted every case in two families before the raw
corpus bytes settled it. The arrow is now stated here because the tool's own output does not
say which side is which.

**Brevity pointed at the wrong cause TWICE in one night, both times at the same family.** The
ten shortest `def-extra` documents are all unclosed-construct shapes, and classifying all 304
puts "no unclosed construct" at 194 of them. The ten shortest `def-miss` documents are all the
tab-in-marker-separator family -- refused four ways with a ceiling of ten -- and a stride over
all 260 puts `column 0` and `indent 4+` at 50 each against 111 tab cases. **Both of the night's
biggest wins came from the buckets the shortest members hid**, and this file already records
selection-by-brevity dying four times. Classify the family; do not read its head.

**A `still wrong` row is not damage.** The threshold fix reported 5 gained, 0 lost and 10 still
wrong, and reading those ten showed the definition now CORRECT in every one -- the oracle agrees
the label should not define -- with only the reference side still differing. So the bucket mixes
"improved inside a still-failing conjunction" with "broke differently", and the scorer's
better/worse is what separates them. Read both, not one.

### The B3 arc, closed in three parts and one retraction

B3 is their rules document's de-indentation minimum, and these notes have claimed three times
that it governs three things. Two of them shipped:

- **the definition's column** -- `deIndentFloor` in `definition-column.ts`
- **where indented code begins** -- `definition-deindent-code.ts`, after FOUR scoring runs
  settled the unit: characters, a tab counting one, and a tab after a space counting nothing
  (expanded columns scored -12, characters +1, leading tabs expanded -2, the final form +4)

The third is **refuted**. A floor can only fall as lines arrive, so the minimum really is
computable in a stream -- `tokenizeIndent` admitting a shallower line and lowering
`containerState.size` -- and built that way it costs 32 referee documents and four CommonMark
list cases, because a shallower line is how a SIBLING MARKER announces itself. So
`remark-parse@8` decides an item's lines some other way and applies the minimum only to the
DEDENT of lines it already owns. "Strips an item by the smallest indentation among its lines"
is about stripping, and this file had been reading it as being about ownership.

### What the queue looks like now

1311 disagreeing documents in 70 shapes at the start, 1298 in 68 at the end. The largest
measured lead is **+19**, scored and not built: an unclosed `$$` after a definition inside a
list item, blocked on bounding the math node's extent at its opener before the definition can
absorb it. The reference families (`ref-miss` 201, `ref-extra` 196) remain the biggest counts
and remain mostly cascades from the definition side.

### 5502 to 5702: what the tokenizer route returned, and the number refused along the way

Thirteen fixes. The last five are one thread, and it is the thread this file had pointed at
five separate times without being able to walk it:

| landed                                              | referee |
| --------------------------------------------------- | ------: |
| a fence in a list item keeps shallower lines        |     +37 |
| `$$` the same way, `htmlFlow` deliberately not      |     +16 |
| a capped item keeps a line above its content column |     +28 |

**What unlocked it was a restriction derived from the construct.** B3's minimum applied in the
tokenizer was refuted the night before at -32 referee and four CommonMark list cases, because a
shallower line is how a SIBLING MARKER announces itself. Inside a fence it cannot be -- fence
content is literal -- and that is a property of fences rather than a narrowing fitted to the
losses. The four list cases stayed green throughout.

**And the container CAN see the flow**, which was the open question that made the route look
closed. The document tokenizer's own events hold container tokens only, so scanning them for
`codeFenced` finds nothing. The flow events live in the child tokenizer micromark attaches to
each `chunkFlow` token, and every chunk on a line shares one: an `enter:codeFenced` with no
matching `exit` is an open fence.

#### A repair scored +7 where the tokenizer was worth +37

The same rule as a repair pass -- extend the fence node, drop the buried siblings, re-parse the
tail -- scored `better 8 / worse 1` and was recorded as too risky to build. In the tokenizer the
identical rule is worth five times as much, because it fixes the STRUCTURE rather than filtering
the facts a wrong structure produced. Worth remembering the next time a repair looks cheaper.

#### The bigger number that was refused

Admitting a shallower line for ANY item, excluding only lines that could start a marker, scores
**referee +52 at 74 gained / 21 lost** -- nearly double the landing that replaced it. Refused,
because "exclude markers" is exclude-what-broke rather than a property of anything, and the 21
losses are documents where we were RIGHT and became WRONG, each with a definition moving from
root into the item's column. The version that shipped has a derivation instead:

    ⟨2sp⟩1.⟨5sp⟩Prose here / ⟨4sp⟩[^1]: Definition    obs 1@1:4 -- the line JOINS the item
    10.⟨2sp⟩Moreend.       / ⟨2sp⟩[^ä]: Some words    obs ä at ROOT, column 0

The CAP is what differs, and `otherPrefix` is reached exactly when it fires.

#### `def-end+1` is closed from both ends

The largest positional family at 151 entries, and classifying all of them -- rather than
reading the six shortest, which misdescribed it for the fifth time -- gives:

    85  quote        17  comment      12  list marker    9  math
     8  another label  8  heading      5  fence          4  tab-indented text

56% are quote lines, which is the `quote-truncate` family this file already refuses at 91
better against 395 worse. The tail is seven mechanisms of four to seventeen. A candidate built
for the tab bucket -- which is FOUR entries -- scored 25/188. Nothing in the family is worth
building, and that now holds from both directions: the largest slice is refused with numbers
and no slice in the tail is big enough to matter.

### The queue after the reference work, and one finding left unfitted

`ref-miss` collapsed from 203 to 126 when adjacent references landed, and the remaining
reference mass is `ref-extra` at 204. Classified over documents whose DEFINITIONS already agree
-- so not the cascades this file attributes the family to -- it splits:

    200  plain text line        86  the label line itself     67  quote line
     28  after %% on the line   21  indented 4+ line          13  inside $...$

Two of those were examined and are recorded here rather than built.

**`[^name](url)` is a link, not a reference.** Obsidian reports no reference and registers the
`^1` as a BLOCK id instead: `see [^1](u)` / `[^1]: d` gives `refs []` and `blocks ["1"]`, and we
report a reference. The rule is already in `KNOWN_REFERENCE_GAPS`, and the reason to leave it
there is size: **4 of 6,818** referee documents hold `[^name](`. The 200-entry bucket is not
this shape -- it is dominated by references inside autolinks (`<a://b[^1]>`) and inside fences.

**A callout plus a TAB makes its line literal, and a plain quote does not.** Six probes:

    > [!info]   / >⇥Prose here [^3]     obs []        we index it
    > [!note]   / >⇥code[^2]            obs []        we index it
    > [!note] T / >⇥code[^2]            obs []        we index it
    > plain     / >⇥code[^2]            obs 2@1:6     we agree
    > [!note]   / >⟨4sp⟩code[^2]        obs 2@1:9     we agree
    > [!note]   / > code[^2]            obs 2@1:6     we agree

The `sections` confirm it independently: the three empty cases carry no relocated-footnote
`text`/`element` entries, so nothing was rendered to reference.

A mechanism suggests itself -- `obsidian-flavored-markdown` forces a newline after a callout
title, so the tab line starts a FRESH block and becomes indented code, where in a plain quote it
continues the paragraph lazily. **It does not survive the fourth row**: four spaces after the
title behave like the quote, not like the tab, and no indent arithmetic this file has makes a
tab and four spaces differ there. So the observable is recorded and the rule is not, because
implementing an observable whose mechanism is unknown is how this harness has previously fitted
a number instead of a rule -- and the tab family in particular is recorded as refused four ways
with a demonstrated ceiling of ten.

#### And the rest of `ref-extra` is a long tail that MINIMISES AWAY

Four sub-families were taken apart. Three are small and the fourth is a family already refused:

| sub-family                          | size           | state                                  |
| ----------------------------------- | -------------- | -------------------------------------- |
| `[^name](url)` is a link            | **4** of 6,818 | already in `KNOWN_REFERENCE_GAPS`      |
| a reference inside `<...>` autolink | **6** of 6,818 | rule confirmed, population too small   |
| label inside a real FENCE           | 39             | the five-space cap again -- see below  |
| callout plus a TAB                  | 67             | observable recorded, mechanism unknown |

**Two of those were picked by reading the bucket's shortest members, and both were wrong about
its mass** -- the link shape is 4 documents and the autolink shape is 6, against a bucket of 200. That is the third and fourth time in two sessions that the head of a family misdescribed
it, and the lesson has now been paid for enough times to state as a procedure: **classify the
whole family and COUNT the sub-family before probing it**, not after.

The fence sub-family is the instructive one. All six minimal spellings AGREE -- ` ``` ` /
`[^1]: def` reports neither a definition nor a reference on both sides, closed or unclosed, at
root or after a paragraph. The disagreement needs the dense document:

    *⟨4sp⟩~~~ / ⟨3sp⟩Text / ⟨3sp⟩[^2]: body text / ⟨5sp⟩~~~

Our tree closes that fence IMMEDIATELY -- `code@1-1` with an empty value -- and its intended
content becomes a paragraph, so the `[^2]` inside it is a live reference where Obsidian has it
buried. The opener sits at column 5 behind a `*⟨4sp⟩` marker, which is the five-space cap
family: already refused three ways at 11/97, 0/3 and 31/351, and reached here from a fourth
direction. `fenceOutlivesTransform` cannot help because it handles UNTERMINATED fences and this
one closes.

So the honest statement about `ref-extra` is that it is not one family at 204. It is a dozen
mechanisms of two to forty documents each, and **the two largest need something this harness
does not have**: a mechanism for the callout tab, and the five-space cap in the tokenizer.

## A THIRD dormant field, and it is the largest: Obsidian's own code-block ranges

Asked to find the next large actionable step with the queue mined out, and the answer was not in
the queue. The referee's records have five keys and `referee.mts` read three:

    id   text   defs   refs   code
                              ^^^^ read by nothing, on every document, since the corpus was made

`code` is `[[start, end], ...]` -- Obsidian's own code-block line ranges, zero-based and
inclusive -- and **883 of the 6,818 documents hold a non-empty one**. That makes it the third
dormant field this harness has found and by far the biggest: `referenceLinks` was 111 answers
and the `math[].tex` capability was the other. It is an oracle for precisely the family the
definition and reference work keeps running into -- where a fence or an indented block begins
and ends -- and it has been sitting in the corpus unread the whole time.

**It is ROOT LEVEL ONLY, which had to be measured rather than assumed.** Comparing every `code`
node in the tree agrees on **52.4%**; comparing only the tree's own children agrees on
**82.9%**, and every extra block in the first reading was one inside a container:

    > [^a]: d / > / ⇥continued / blank / >⟨5sp⟩```     records [[2,2]] -- the ROOT indented
                                                       code, and not the quoted fence

So the first reading's 420 disagreements were 269 instances of the harness asking the wrong
question. `referee.mts` now reports the dimension beside the footnote one rather than folded
into it -- different question, different population, and mixing them would make neither figure
readable:

    code blocks (root level), a dimension nothing read until now:
      732/883 agree (82.9%)
        118  we report NO root code block
         12  block count differs (1 vs 2)
         10  block count differs (2 vs 1)
          8  a block STARTS elsewhere
          1  a block ENDS elsewhere

**151 disagreements, 78% of them in one bucket.** That is a better-shaped target than anything
left in the footnote queue, where the largest remaining slice is refused with numbers and the
tail is mechanisms of four to seventeen documents.

One probe wave has already been spent on the head of that bucket and five of its six shapes
AGREE -- a root `⇥- item` is indented code on both sides, as are `⟨4sp⟩- item`, `⇥1. item` and
`⇥⟨2sp⟩text`. So the 118 is not the obvious rule, and the next step is to classify all of it
rather than read its shortest members, which is the procedure this file has now paid for five
times.

### `code` IS a slice of `sections`, which corrects a recorded blind spot

Worth asking why the field is root-only rather than taking it as a quirk, and the answer is that
it is not a separate recording at all. Checked against live 1.14.4 on five documents, and
`code` equals `sections.filter(type === "code")` every time:

    <div> / Prose here / </div> / - parent Text[^Ω] / blank / ⟨4sp⟩2)⟨8sp⟩Prose here
      referee code         [[5, 6]]
      sections[type=code]  [[5, 6]]
      all sections         html@0-3  code@5-6

`sections` is Obsidian's own block-level parse and this file calls it the primary oracle --
root-level by construction, which is exactly the restriction. And `root` is nothing to
implement: it is standard mdast, `tree.children` are the top-level blocks, and the word in that
sentence describes Obsidian's section model rather than a node type this package is missing.

**So a recorded blind spot was wrong.** `overview.ts` listed the referee as blind to "section
geometry", on the evidence that the container-comment rule scored 0 of 6,818 documents -- and
that evidence was about DEFINITIONS, from a scorer that only ever compared definitions and
references. The referee holds a slice of the section oracle for 883 documents and always did.
Corrected in place; the honest claim is that it is blind to section geometry EXCEPT code
sections.

What that opens is the family the blindness was invoked to decline. The container-opened `%%`
work was refused as "section geometry only, which the referee's oracle cannot see by
construction" -- and for any of its documents that hold a code section, it can. Making that
measurable wants a `code` dimension in `score.mts`, whose candidates currently return
`{defs, refs}` and would need to return ranges; that is the next instrument, not the next rule.

## Asking Obsidian directly, in two seconds

`parity:record` boots Obsidian under Xvfb, renders all 3,403 corpus cases and rewrites the
goldens: seventy seconds, and it only answers for documents already committed to `corpus.ts`.
So every question cost a corpus edit, a collision check, a recording and a triage pass -- a
commit cycle per question, which is most of why probing felt expensive and why progress
tapered.

The Obsidian CLI (1.13+) evaluates JavaScript in the running app, so the same
`computeMetadataAsync` the recorder uses can be called on any string:

    npx tsx --conditions=development test/parity/ask.mts '[^1]: def' 'use[^1]'

**Three questions in 1.3 seconds**, nothing written, no corpus change, no goldens moved. Use
it to settle a rule, then PROMOTE the shapes that settled something into `corpus.ts` -- the
corpus is still what the gate asserts, and a probe nobody recorded proves nothing to CI.

Four details are load-bearing, three taken from `quartz-syncer`'s operability notes, which
document this channel for its own plugin:

- **`2>/dev/null`**, or every call is buried in GTK and Electron warnings.
- **Obsidian must be running with a vault open.** A cold `obsidian eval` launches the app and
  returns the launcher's log lines; with no vault open it returns nothing at all, silently.
  `ask.mts` checks liveness first for exactly that reason -- both failure modes otherwise read
  as "Obsidian found no metadata in this document".
- **The result window is roughly 5-15 ms.** Anything logged after `eval` returns is lost and
  the call reports success with empty output, so an `await` cannot be answered in one call.
  Stash onto a global and read it back with a second synchronous eval; `ask.mts` batches every
  question into one stash because the per-call overhead is the expensive part.
- **Markdown goes base64-encoded.** It passes through a shell argument and then a JavaScript
  string literal, and quoting it twice is how a probe silently becomes a different document --
  these notes already record a tab and a U+00A0 surviving one layer and not the other.

### A projection string is not round-trippable, and reading a field out of one is a trap

Fifteen under-covered wikilink and embed shapes swept with `ask.mts` -- block links, embed
sizes, heading-plus-alias, multiple pipes, nested brackets -- against live Obsidian. **All
fifteen match.** That family is solid, which is worth knowing given nested brackets carry
three designed probes against 39% of independently discovered sweep causes.

The sweep cost two wrong comparisons to establish, both the same mistake, and it is a trap
worth naming. The link projection is built as

    `${original}=>${link}|${displayText}@${span}`

so `[[a|b|c]]` records as `[[a|b|c]]=>a|b|c@0:0-0:9`, which is target `a` and display `b|c`
concatenated. **That string cannot be parsed back into its fields**: `a|b|c` could equally be
target `a|b` with display `c`, and no reader can tell. Both of my extractions were wrong --
once taking the whole `=>` tail as the target, once splitting on the LAST pipe -- and each
reported fifteen or one divergences that do not exist.

The comparison the gate performs is safe because both sides are built by the same formatter
and compared whole. So: **compare these strings, never parse them.** Any rule about a link's
TARGET specifically needs the recorder to store the target separately, which it does not --
and that is the real reason link and embed rules have been hard to measure here, rather than
anything about the constructs.

Two corpus cases already covered the shape that looked wrong -- `wikilink/multiple-alias-separators`
and `embed/alt-and-dimensions`, both `match` -- which is the cheaper check that would have
caught it: **before believing a sweep's divergence, look for a corpus case with that shape.**

### The referee is a reliable target, measured rather than assumed

Worth settling before more work is spent against it, and impossible to settle cheaply until
now: of the 1,482 documents where this package and the referee still disagree, how many are
OURS to fix and how many are the referee being stale against 1.14.4? Its answers were
recorded by a sibling project against its own Obsidian version, so a stale corpus would cap
the achievable number and every point chased past that cap would be a regression against the
real application.

Eighteen disagreeing documents sampled at a fixed stride over the corpus, shortest first,
and their DEFINITIONS compared three ways against live 1.14.4:

| outcome                                                       | count |
| ------------------------------------------------------------- | ----: |
| live agrees with the referee, so **we are wrong**             |    12 |
| live agrees with the referee once inline ids are dropped      |     2 |
| definitions agree all three ways; the disagreement is in REFS |     4 |
| **live agrees with us, so the referee is stale**              | **0** |

Zero. The referee is not stale on any sampled document, so the remaining disagreements are
real work and the target is sound.

Two details the sample also pins. Live `footnotes` includes INLINE footnotes under synthetic
ids like `[inline0`, which the sibling project's recorder drops by design -- that accounts for
the two near-misses and is a recording convention rather than a disagreement. And live
`footnoteRefs` lists only references whose name HAS a definition, so it cannot adjudicate the
reference side at all; that is what the project's synthesised-definition method exists for,
and comparing refs against live Obsidian needs the same trick rather than a direct read.

### It earned its place in the first four minutes

Asked `> %%` / `[^3]: Text` and got `footnoteRefs: []`, where the referee's recorded answer
for that exact note is `refs: [["3",1,0]]`. That reads as the referee corpus being stale
against 1.14.4 -- and the commented-definition rule, the second-largest referee gain recorded
here at +123 documents, is fitted to it.

It is not stale. `footnoteRefs` lists only references whose name HAS a definition, which the
next question confirms: in `%%` / `[^1]: buried` / `%%` / `use[^1]` even the live `use[^1]`
outside the comment is absent, because the buried definition defines nothing. The sibling
project's `refs` field is broader by construction -- it re-parses each note with a SYNTHESISED
definition for every undefined name, which these notes already record -- so the two fields
answer different questions.

Supplying the definition settles it on live 1.14.4:

    > %% / [^3]: Text / blank / [^3]: synthesised
        footnotes    = ["3@3:0"]     only the live definition defines
        footnoteRefs = ["3@1:0"]     the BURIED label is indexed as a reference

Exactly the referee's answer. So the rule holds on the current release, and a question that
would have cost a recording cycle cost four seconds -- including raising a false alarm and
clearing it, which is the part a slow loop discourages anyone from doing.

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

It took this package from 41.1% to 72.1% agreement, and seven of the rules in
`src/lib` exist because of it. What it reports now, and what is known about each
remaining family:

| disagreement            | count | state                                                            |
| ----------------------- | ----: | ---------------------------------------------------------------- |
| reference set differs   |   668 | mostly cascades from a missing or invented definition            |
| same names, wrong spans |   489 | definition spans; see the measured split below                   |
| both sets differ        |   438 | as above, compounded                                             |
| definition set differs  |   335 | the directly actionable bucket; 90.0% of documents already agree |

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

### Mining the referee's reference bucket, with the numbers that killed my own lead

Measured end to end so none of it needs re-deriving. Run the referee, then these
predicates; every count below is from the 6818-document corpus at 70.8% agreement.

**The bucket, split both ways.** 562 we-miss, 506 we-invent, 38 both. 600 documents hold at
least one missing reference.

**A commented definition degrades to a reference — real, but 97 documents, not 562.**
The rule is sound and this harness already holds both halves of it: a definition inside a
comment does not define (`definedFootnotes` has that right), and a reference inside one
still counts (710 documents agree because of it). The consequence never implemented is
that when the definition fails, its label is still a reference — `%%` / `[^3]: Text`
should yield a `footnoteReference` named `3` and we emit nothing.

Its actual size, narrowed by three successive predicates:

| predicate                                                | documents | refs disagree |
| -------------------------------------------------------- | --------: | ------------: |
| holds a `%%` and a definition-shaped line                |      1673 |           498 |
| the definition line is inside an **open** `%%` span      |       439 |           220 |
| ...and the definition's **own label** is the missing ref |         — |        **97** |

**And the base-rate trap I walked into.** I picked this shape from the ten shortest
we-miss documents and called it a 562-document lead. Of the 1673 documents carrying the
shape, **1175 AGREE**. Selection by brevity is selection, and the README already says to
compute a base rate before believing a count — this is the fourth selector to die that
way, after probes-per-case, co-occurrence and construct frequency.

**Label composition is not a cluster either.** Of the missing names: 487 plain word, 226
non-ASCII, 157 ASCII punctuation. No charset story, so `[^👩‍💻]` and `[^نیم‌فاصله]`
failing is incidental rather than causal.

**And then the rule died outright.** The 97 was still a conditional — "documents where the
definition's own label is the missing reference" — which says nothing about how often the
rule would be WRONG. Measured the only way that settles it, by asking whether Obsidian
reports a reference at that exact label, line and column:

| documents with a definition-shaped line inside an OPEN `%%` span | 809     |
| ---------------------------------------------------------------- | ------- |
| Obsidian reports a reference there for all of them (we gain)     | **444** |
| Obsidian reports one for none of them (we break)                 | **329** |
| mixed                                                            | 36      |

57.5% is not a rule. Synthesising those references invents 329 documents' worth of
positions Obsidian does not have, and a wrong offset is worse than a missing one — so
something else discriminates, and the shape as stated cannot be implemented.

**This is the fifth selector to die here, and the first to die twice.** It survived a base
rate (1175 of 1673 agreeing) only because each narrowing was measured against the failing
side alone; counting the side where the rule would FIRE is what finished it. The sequence is
worth keeping as a worked example: ten shortest documents → 562 → 439 → 97 → refuted. Every
step was a real measurement and the conclusion was wrong until the last one.

### ...and then the rule turned out to be real, because the PREMISE was what I was measuring

Four refutations, written up above as permanent, and all four were measuring the wrong thing.
Every one classified "is this label inside an open comment?" with a hand-rolled `%%` scan
over the note's text -- and that scan, not the rule, is what the numbers described.

The control that exposes it is one line: of the label lines the scan called buried and
definition-less, how many does Obsidian nevertheless DEFINE?

    550x  def=false ref=true     the rule holds
    319x  def=true  ref=false    Obsidian defines it, so the premise never applied
    125x  def=false ref=false    genuine counter-examples

The 319 are not counter-examples; they are notes where the scan is wrong about the comment's
extent. Dropping them moves the rule from 57.5% to **81.5%**, and teaching the scan about
fenced code -- a `%%` inside a fence is not an opener, and my scan went out of phase on it --
to **86%**. The column was never the problem: 550 of the hits are at the label's exact
column and **zero** are at a different one.

The scan was never needed at all. **Our own parser computes comment extents**, so asking the
tree which definitions are buried is exact, free, and the same thing a consumer sees.
Measured that way the rule gains **123 documents against 7**, taking the referee from 76.4%
to **78.1%** -- the second-largest single move recorded here. The 7 losses are all notes with
a fence inside the comment, where our extent differs from Obsidian's, which is a separate and
already-tracked class.

Three lessons, and the first is the expensive one:

- **A predicate that stands in for the premise is part of what you are measuring.** Four
  measurements agreed with each other because they shared one scan, and the agreement read as
  confirmation. Where a rule's premise is structural, compute it from the tree -- which is the
  same conclusion the structural-adjudication limit reaches from the other side, and it was
  available on all four earlier attempts.
- **"Refuted" and "abandoned" are different claims**, and the write-up conflated them. One
  coarse predicate was refuted four times; the rule was never tested.
- It belongs in the **projection**, not the tree. A `footnoteDefinition` nested in a `comment`
  is more informative than a reference, a formatter needs the definition's own span to rewrite
  the line, and synthesising a reference node would put a construct in the tree that no source
  character spells. Where Obsidian's INDEX reinterprets a node, the reinterpretation belongs
  downstream -- the rule that already keeps a dangling reference and a surplus table cell.

What remains true and useful: the asymmetry itself is real (a definition inside a comment
does not define, a reference inside one is indexed, 710 documents depend on it), and it
belongs in the reference half of `parseComments` rather than in a projection if a correct
form of the rule is ever found.

### The four-item plan, worked through and mostly refuted

Written after the coverage metrics, in the order recommended, with what each turned out to be.

**Item 1 — definition `endLine`, 381 entries. A LONG TAIL, not three families.** An earlier
measurement on document counts had split it into "we absorb a `>` continuation", "we run
past an unclosed fence" and "we stop short of unclosed math", which read like three fixes.
At entry level it is **112 distinct shapes, largest 27**, in both directions: 275 rows where
we run longer and 106 where Obsidian does. And 60 of the 381 are in documents holding **no
fence, comment or math at all**, so the unclosed-construct story cannot even cover the set.
There is no dominant family here to attack.

**Item 2 — refuted outright. See the section below.**

**Item 3 — definition `startCol`, 188 entries. Four directions, no single rule.** The two
content-column rules already landed (tab prefix −25 documents, quote prefix −60) took the
family from 440 to this. What remains splits 79 spaces-only where Obsidian reports HIGHER,
65 tab-prefix where it reports LOWER, 26 spaces-only LOWER, 14 tab HIGHER. Both prefixes go
both ways, so the prefix is not the axis and a constant offset is ruled out. The README's
standing note applies: this wants probes against the application, and a constant column is
the signature of the author's `P1` defect rather than a rule.

**Item 4 — the 451 unplaced nodes. Worth doing, for a different reason than I gave.** Every
one is a `footnoteReference`: 432 inside a paragraph, 17 inside a heading, 2 inside a
`delete`. The referee EXCLUDES them from its set comparison, so driving the count down moves
agreement in either direction and it is a bad target for this metric — which is what the
earlier note said. But a reference with no position is a real defect for a consumer:
`obsidian-linter` splices by offset, and a positionless node is one it cannot touch. So this
is the one item of the four with a clear case, and the case is usability rather than
agreement. `points.test.ts` already gates the count.

**Item 4, localised.** Bisecting the option flags on the smallest reproduction --
`> plain text` / `>⇥code[^2]` / blank / `use[^1]` -- gives one answer:
`bareFootnoteRefs: false` takes the document from 2 unplaced nodes to 0. So every one of
the 451 comes from `footnote-bare.ts`, through `alignToSource`, which maps an index in a
node's VALUE back to an offset in the source. These hosts are the case it cannot map: a
quote strips `> ` from every line and a tab is re-expanded, so the value and the slice
differ by exactly the characters the alignment has to skip. The governing rule names the
shape -- a raw source slice is the right source for a position and the wrong source for a
value -- and `alignToSource` exists to bridge it.

Two indent-skip variants of that bridge are already recorded as refuted in
`footnote-bare.ts`, with their parity and referee numbers, so this is known-hard rather
than unexplored. What is new here is the two oracle answers it has to satisfy at once, from
documents that differ by one character:

    >[!note]  / `>     code[^2]`   five spaces -> indented CODE, and Obsidian indexes NO
                                   reference, so ours should not exist at all
    > plain   / `>⇥code[^2]`       a tab -> NOT code, and Obsidian indexes the reference
                                   at 1:6, so ours needs that exact position

Both reduce the unplaced count and both are correct, which makes this the one item of the
four where the work is defined and the evidence is already in hand.

**Done, and it was the largest single move on this oracle to date.** A third alignment mode
that skips a quote marker run after each line ending -- tried only after the strict and
indent modes fail, so an alignment that already succeeds cannot change -- takes the referee
from **72.1% to 73.6%, +103 documents**, and the unplaced count from **451 to 113**. Zero
parity regressions, no corpus ceiling moved.

The bug was wider than the code-block framing suggested. `> q` / `>   near [^b]` is two
columns of indent, nothing to do with code, and its children were unplaced for the same
reason: a quote strips `> ` from every continuation line, so no multi-line paragraph inside
a quote could ever align. The 451 were not a family of odd documents; they were every
quoted multi-line paragraph holding a reference.

Of the 113 left, Obsidian wanted 47 and did not want 66, and the 66 were the indented-code
case -- a reference inside `>     dolor [^b]`, which Obsidian reads as code and does not
index. Placing those was never the fix; not creating them was.

**That structural half is done too.** A paragraph inside a quote whose EVERY line sits at
or past `codeIndent` columns of the quote's own content column becomes a `code` node, which
takes the referee to **73.9%** and the unplaced count to **50**. Only an all-lines paragraph
is converted: a mixed one, `> q` over `>     code`, is lazy continuation to CommonMark and
was left alone rather than guessed at.

One detail decided it, and getting it wrong broke CommonMark's own example 252. **A quote
marker consumes ONE following space as part of its prefix.** So `>     code` is four columns
past the prefix and is code, while `>    not code` is three and is a paragraph -- example
252 is exactly that pair, and counting the marker's own space as indent converted both.
`>⇥code[^2]` falls out the same way: the tab advances to column 4 and belongs to the marker,
leaving an indent of zero, which is why the referee has that reference indexed.

**The honest summary.** Three of the four items do not survive measurement as tractable
work, and the one that does is not the one ranked highest. The corpus is the better
instrument for the long tails: its cases are small enough that one case is one cause, which
is exactly what the referee's dense documents are not.

### A tab after a space is not indented code

Measured because the referee holds **127** Obsidian definitions on tab-prefixed lines that
we do not produce, and its own documents are too dense to say why: splitting them by where
the tab sits gives 17%, 22% and 10% missed across the three positions, which is no rule at
all. Six probes answer it in isolation:

| document         | Obsidian          |
| ---------------- | ----------------- |
| `⇥[^1]: def`     | no definition     |
| `⇥⇥[^1]: def`    | no definition     |
| `    [^1]: def`  | no definition     |
| `  ⇥[^1]: def`   | definition, col 0 |
| `>   ⇥[^1]: def` | definition, col 2 |
| `+⇥   [^1]: def` | definition, col 2 |

So a **leading** tab counts its four columns and reaches the indented-code threshold, while
a tab **after a space** does not. That is the same asymmetry the legacy arbiter shows for
` ⇥[^1]: def`, recorded in `definition-column.ts` long before this.

micromark follows CommonMark and advances to the next tab stop either way, so it makes these
lines `code` and there is no definition to place or position. Verified unchanged at HEAD~3,
so this is micromark's own tab handling and not any pass here — which also means closing it
needs a repair that re-parses such a `code` node, not a column rule. Two probes are
`replicate` and listed in `KNOWN_REFERENCE_GAPS` with that reasoning; four of the six
already match.

**The repair crashed on the first attempt and lands on the second**, and the difference
between the two is one line of reasoning worth keeping. The plan was sound: the `code` node
already carries its content with four columns stripped, so re-parsing the original line and
splicing it back is far less work than replacing micromark's tab accounting. The first
attempt reused the quote-only `prefixLength`, so a list line was left whole, the entire
`+⇥   [^1]: def` re-parsed as a NEW LIST, and splicing a list into a `listItem` threw inside
micromark's tokenizer.

Stripping **the container's own prefix** first — a `>` run for a quote, the marker and its
separator for an item — fixes it: `>   ⇥[^1]: def` is now a definition at column 2, the
referee moves 75.2% → 75.4%, and the `footnotes` and `footnoteRefs` ceilings each fall by
one.

The list sibling stays `replicate` and its cause is DIFFERENT, which the probe pair is what
shows: in `+⇥   [^1]: def` the tab is the marker's own separator rather than indentation
after a space, so it turns on micromark's list-item tab straddle — `containerState.size`
counting characters while `factorySpace` consumes columns — and not on the code threshold at
all. Two shapes that look identical in a prefix dump, one rule each.

### The largest localised family is TABS, and it is the first feature here to beat its base rate

Classifying the reduction tool's 349 minimal forms by SHAPE rather than by text -- the lesson
that retired exact-string dedup on the fuzz sweep -- gives one feature well clear of the
others:

| feature over the 349 distinct minimal forms | share |
| ------------------------------------------- | ----: |
| holds a tab                                 |   50% |
| an indented continuation line               |   68% |
| a reference outside any label               |   82% |
| a list marker hosts the label               |   32% |
| holds a `%%`                                |   19% |

The 82% and 68% are the generator: nearly every note has them. The tab figure is the one that
survives its base rate, which is the test four earlier selectors failed:

    notes holding a tab:  all 45.0%   disagreeing 62.9%   lift 1.40
    P(disagree | tab)    = 30.5%
    P(disagree | no tab) = 14.8%      odds ratio 2.06

**And it localises.** Asking whether the tab sits on a line either side actually disagrees
about, rather than anywhere in the note:

    426  tab ON a disagreeing line
    512  tab elsewhere in the note
    553  no tab at all

So 426 of 1,491 disagreements are tab-positioned, against 512 where a tab is present and
incidental -- which is exactly the distinction every earlier frequency selector could not
make, and the reason this one is worth acting on.

**Three tab rules are implemented** -- a tab after a space does not reach the four-column
code threshold while a leading one does, a tab in a list marker's separator puts the
definition at the marker, and a tab-indented list item begins just past its tab run.
`commonmark/tabs/9` and `probe/def-tab/marker-tab-spaces` are the two recorded cases that
remain, and comparing the indent unexpanded is refuted at 0 gains against 4 regressions.

**And the real rule is now measured, directly.** Asked of a running Obsidian rather than
inferred: `+⇥   x`, `+⇥    x`, `+⇥     x`, `- ⇥p`, `- ⇥⇥x` and `1.⇥   x` all report a plain
`list` with one item and NO `code` section. Four and five following spaces would both clear
the indented-code threshold if the tab were expanded, so **a tab in the marker's own
separator means the content is never code, at any space count.** We make `code` of six of
those seven.

Ten questions also pinned the definition side, and nine of the ten now agree after the
column rules already landed. The one that does not is `- ⇥p` / blank / `  [^1]: def`, where
Obsidian takes the definition INTO the item at column 2 while `-  p` with two spaces leaves
it at root column 0 -- the separator's tab is what moves the item's content column to 2.

**The repair is attempted three ways, measured each time, and reverted.** Each scoping closes
`probe/def-tab/marker-tab-spaces` and each is a net loss against the referee:

    unrestricted                     78.3% -> 77.9%   -27 documents
    ...plus a fence guard            78.3% -> 77.9%   -27, recovers none
    ...plus root-level items only    78.3% -> 78.0%   -16

Narrowing helps and never reaches break-even, which says the SHAPE of the repair is wrong
rather than its scope: re-parsing an item's content produces a node with its own extent, and
in a dense document that extent competes with every enclosing block. It is the same
constraint that made the first version of that pass throw by splicing a list into a
`listItem`. So the rule belongs in the list construct's own indent accounting, where the tab
is measured once and nothing downstream is re-parsed -- `legacy-list.ts` is the vendored copy
that would carry it.

Which oracle to believe was settled by ASKING Obsidian about the regressed documents rather
than reasoning about them: on the first, live 1.14.4 agrees with the referee EXACTLY and our
new answer is wrong by one end line; on the second all three differ and ours is wrong either
way. So the referee is reliable here and the repair over-reaches, however sound the isolated
rule is.

That three-way check is the clearest demonstration of what `ask.mts` changes. The same
question a day ago would have been "the corpus says better, the referee says worse, pick
one" -- and the honest answer needed a third opinion that used to cost a recording cycle.

**The mechanism these notes previously attributed it to does not exist.** "`containerState.size`
counts characters while `factorySpace` consumes columns" has been repeated here and in several
commit messages, and it is false: the vendored list reader sets `size` from
`sliceSerialize(token, true)`, whose second argument is `expandTabs`, so the count is ALREADY
in columns. Rewriting it to expand tabs explicitly is byte-identical on every tab case tried
-- `+⇥   [^1]: def`, `- ⇥p`, `- foo`/`⇥- bar`, ` - foo`/`   - bar`/`⇥- baz`, `-⇥foo`/`⇥bar`
and `1.⇥x`/`⇥y` all parse the same before and after -- and the referee does not move.

`list-tab-straddle.ts` had already corrected this in its own docstring: "The cause recorded
from the prediction was wrong: it said `containerState.size` counts characters while
`factorySpace` counts columns. The real boundary is a threshold." That correction was made
when the pass was written and the summary here never picked it up, so the wrong cause stayed
in circulation and got re-derived from memory as the obvious next fix. **A correction recorded
in a source file does not propagate to a summary that paraphrases it**, and the summary is
what gets read when choosing work.

The sibling project reached this by vendoring `remark-parse@8`'s list reader wholesale, which
is not available here -- but `container-lazy.ts` records that `disable: {null: [...]}` DOES
reach container constructs, so replacing micromark's `list` whole is a route this package has
already used once. That is the shape of the remaining work, and it is now sized: 426 notes,
one mechanism.

### Re-running the other stand-in measurements: one refuted harder, one advanced

The commented-definition lesson -- that a predicate standing in for a structural premise is
part of what you measure -- applies to two more conclusions recorded here, both of which were
reached with a line scan. Both were re-run against the TREE.

**The quote-absorption truncation is refuted harder, and that is the useful outcome.** The
line-scan version scored 91 better against 395 worse, and the obvious explanation was that
the 395 are definitions INSIDE a quote, where quote-prefixed lines are their own
continuation. Asking the tree which definitions sit in a `blockquote` or `callout` and
scoring each group separately:

    definition at ROOT    better 20   worse  85   (19%)
    definition in a QUOTE better 71   worse 310   (19%)

Identical ratios. The definition's own nesting is not the discriminator and the truncation
rule is simply wrong, which is now established on the premise computed rather than guessed.

**The definition start-column bucket advanced from "no rule" to a legible 88.7% one.** The
line-prefix grouping gave the same four-space prefix carrying opposite deltas and the bucket
was written off as not line-local. Deriving the host list item from the tree instead, and
restricting to the 106 disagreeing columns, Obsidian's answer equals the tree-derived host
content column in 37 of them -- and the informative rows, where the host column and the
bracket differ, point at one rule:

    45x picks bracket   hostCol=2 indent=1 bracket=1
    38x picks bracket   hostCol=2 indent=0 bracket=5
    36x picks bracket   hostCol=2 indent=0 bracket=3
    31x picks hostCol   hostCol=2 indent=4 bracket=4

`indent >= hostContentColumn ? hostContentColumn : bracket` holds on **1452 of 1637 rows
(88.7%)**, and it agrees with every `probe/def-cap/*` answer too.

**It is not implemented, and the 185 failures say why rather than merely how many.** Some
have Obsidian reporting a column that is NEITHER the host content column nor the bracket --
`hostCol=6 indent=4 bracket=4 obs=2` and `hostCol=10 indent=4 bracket=4 obs=2` -- which can
only mean our innermost `listItem` is not Obsidian's host there. And `hostCol=2 indent=4
bracket=4` appears answering 4 twelve times and 2 thirty-one times, so identical inputs give
opposite answers and something outside the three numbers decides it. The premise is still
contaminated, one level up.

So the standing rule applies to itself: the current implementation is backed by twelve probes
recorded against the application, and replacing it with an 88.7% rule fitted to this corpus
-- where the host identification is demonstrably wrong in some rows -- would trade verified
behaviour for fitted behaviour. The next step is a probe wave, not another referee predicate.

**And the probes already existed, and they refute it.** `probe/definition-column/*` and
`probe/def-column/*` are thirteen recorded column cases, all `match`. The referee's 88.7%
rule holds on **five** of them:

    " [^1]: def"         obs 0, rule says 1    no host, so the root clamp wins
    "  [^1]: def"        obs 0, rule says 2
    "   [^1]: def"       obs 0, rule says 3
    ">  [^1]: def"       obs 2, rule says 3    host column wins at indent 0
    ">   [^1]: def"      obs 2, rule says 4
    "- [ ]  [^1]: def"   obs 6, rule says 7

(Two further reported failures were my scratch script reading line 0 of a two-line probe
rather than the definition's line, so the honest score is six genuine counter-examples out of
eleven valid cases.)

Three are the root clamp -- with no host the column is 0, not the bracket -- and three are
padded hosts where Obsidian reports the host's content column even though the indent is 0, so
`indent >= hostCol` is not a condition at all. The real rule is close to what is implemented:
the host's content column when there is a host, else 0. The referee's `indent` signal was the
contaminated host identification showing through.

**That is the thread closed properly, and it closes in favour of the existing code.** The
lesson stands exactly as stated -- compute a structural premise from the tree -- and so does
its corollary: a tree-derived premise is still OUR tree, and where probes against the
application already exist they outrank a rule fitted to 1,637 referee rows. Checking them
cost one script; implementing the rule would have cost six verified cases.

### The referee cannot adjudicate a rule that needs the containing BLOCK

A real limit of this oracle, found trying to re-measure the definition content-column rule
on it rather than on the corpus's five probes.

The rule needs the host list item's content column. The referee stores only `text`, `defs`
and `refs`, so the host has to be recovered from the text — and a "nearest preceding
marker" scan is wrong often enough to make the result useless. Tabulated by `(content, gap)`
it contradicts itself: content 2 with gap 2 gives the content column 22 times and the
bracket 8 times, content 2 with gap 0 gives the content column 21 times and 0 seven times.
The same pair cannot have two answers, so the pair is not what was measured.

The way out is not a better scan. Recovering the host from OUR tree would work, but then
the measurement is conditioned on our own parse being right about the host, which is the
thing in question when the column is wrong.

So: **a rule whose premise is structural belongs to the corpus, where a case is small enough
that the host is unambiguous.** The referee is the better oracle for anything positional
whose premise is in the same line, and the worse one for anything that needs to know what
block it is in. That is the complement of the lesson below, and the two together explain why
the five corpus probes settled the gap rule and 61 referee entries could not.

### Grouping referee rows by a LINE-LOCAL shape attributes to the line what belongs to the document

The fourth counting heuristic to die here, and the most carefully built: the 394 definitions
we report that Obsidian does not were grouped by the prefix of the line they sit on, which
looked like a clean partition —

| prefix of the invented definition's line | rows |
| ---------------------------------------- | ---: |
| column 0                                 |  179 |
| quote run then a TAB                     |  102 |
| list marker                              |   41 |
| indent 1–3                               |   35 |
| indent 4+                                |   19 |
| indent has a TAB                         |   15 |

and suggested an obvious rule for 136 of them: four columns of indent is indented CODE, so
no definition. The `probe/def-cap/*` wave had already measured Obsidian agreeing with that
at indent 6 against a content column of 2.

**Both halves fall apart on measurement.** Of the definition lines whose prefix is a quote
run then a tab, Obsidian DOES define the label in **54** and does not in 241 — and the
counter-examples are indistinguishable from the positives: `>\t[^Note]: def` is defined
while `>\t[^Note]: tempor…` is not. Same prefix, same label, opposite answers. In isolation
`\t[^b]: Definition` and `    [^n]: body` already yield no definition in bare `remark-gfm`
and here, so those rows are not line-local either.

So the prefix is not what decides. These are dense documents and the deciding factor is
upstream context — a fence, a comment span, or a definition above that ended in the wrong
place. Which points back at the same root cause as the 381 `endLine` rows, and is why the
invented-definition count is mostly a cascade rather than a family of its own: of the 179
column-0 rows, **154** are ordinary-looking definitions with a colon, a space and no
duplicate, meaning they sit inside something for Obsidian and at root for us.

The rule, stated for the next person: **on this corpus, a shape you can see in one line is
almost never the cause.** The corpus's own cases are small enough for line-local grouping to
work; the referee's are not.

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

**A third: one embed ordering outlier.** `fuzz/embed/75` lists its second embed first, and
of the 25 recorded link and embed arrays with two or more entries, 24 are in source order
and that is the only exception. Its earlier embed sits inside `$...$` inside a callout, so
the renderer resolves it late. Matching it would mean inventing an ordering rule 24 cases
contradict — and the whole value of ordering being positional is that a consumer can rely
on it.

**A second must-not-fix group: two zero-width `blocks` entries.** They are the only two of
72 and both sit past the end of their document — `inline ^[^9] real[^7]` registers
`9@3:0-3:0` on a three-line note. The renderer relocates an inline footnote's body to a
trailing section and the `^9` inside it is read as an identifier there, so the position
belongs to a region the author never wrote. Emitting it would invent a block at an offset
the source does not have. Note the recorder already removes `.footnotes` before reading
`text` for this reason, while `blocks` is read from the undisturbed root — so this is the
harness's own asymmetry showing through rather than a parse gap.

**The `P1` family is wider than those two, and it is worth naming because it is the one
group here that must NOT be driven to zero.** Measured across the remaining `links`,
`embeds` and `footnoteRefs` rows: four of them are short by exactly 2 with a `%%` in the
document — `fuzz/embed/24` on both its `links` and `embeds` rows, plus
`hunt/aftercloser-chain-eats-referenced-definition/0` and
`hunt/continuation-masked-under-foreign-label/2`. That is 4 of the 20 positional rows left
in the corpus, so roughly a fifth of what looks like debt is a cache defect to report rather
than reproduce. Writing it into our own offsets would be strictly worse than diverging: a
consumer splicing at those offsets would corrupt the file, which is exactly what the
Obsidian Linter does.

Definition spans are the open ground. Split by **which field** actually differs, over the
489 documents whose names all agree — so none of this needs re-deriving:

| field differing  | documents |
| ---------------- | --------: |
| def END line     |   **272** |
| def START column |   **199** |
| both             |        13 |
| ref column       |         4 |
| all three        |         1 |

- **End line** (272). Signed, `ours - obsidian` is **+1 on 148** documents, −1 on 65, +2 on
  50, −2 on 20, +3 on 12 — so the mode is ending one line late, and the two-sided tail says
  it is not one rule. **This bucket reads the tree, not a projection**, which is the thing
  to know before chasing it: the content-end clamp that closed the corpus's `footnotes` END
  rows lives in `normalize.ts` and therefore moved none of these 272. Applying the same rule
  to the node's own `position` is the largest single identified family left in either
  oracle, and it is not free — `listUnderDefinitionTransform` tests `source.slice(from, to)
!== "\n"` against a definition's end offset, and `points.test.ts` gates offset honesty.
- **Start column** (was 440, then 199). Two content-column rules have now come out of it,
  each confirmed on this oracle rather than on the corpus: the **quote** prefix closed 60
  documents, and the **tab** prefix another 25. Split by the definition line's prefix shape,
  which is the measurement that found the second one:

  | prefix shape  | rows |
  | ------------- | ---: |
  | tab in prefix |  106 |
  | spaces only   |   91 |
  | quote only    |    2 |
  | other         |    2 |

  The tab family is the one worth knowing about, because the rule excluding it had real
  evidence behind it — `remark-parse@8` does not count a tab following a space, so
  ` \t[^1]: def` is re-parsed and placed past that whitespace at offset 2, and a unit test
  asserted exactly that. Obsidian disagrees: `  \t[^ä]: Definition` is column **0**. **The
  legacy stack is an arbiter, not an oracle**, and this is the first time that distinction
  has reversed a shipped rule rather than merely declined a new one.

  The 91 spaces-only rows are NOT the same rule and must not be folded into it — there
  Obsidian reports a column HIGHER than ours, the opposite direction. Broken down by indent
  width, they say something sharper than "the bracket":

  | indent | Obsidian reports |
  | -----: | ---------------: |
  |      7 |            **4** |
  |      6 |            **4** |
  |      5 |            **4** |
  |      4 |            **4** |
  |      3 |                3 |
  |      2 |                0 |

  So it looks like `min(indent, 4)` rather than the bracket — `      [^x-y]: Definition` at
  indent 6 is column 4, and `       [^1]: def` at indent 7 is column 4. Four is also exactly
  where indented code begins, so these definitions can only be inside a list item, and a
  constant 4 is the signature of the class the plugin's author documented as `P1`/`P2`: a
  column computed as if some prefix were absent.

  **And the probes refuted it.** Five `probe/def-cap/*` cases put one host in front of a
  varying indent, and `min(indent, 4)` is simply wrong:

  | probe                             | host content column | indent | Obsidian |
  | --------------------------------- | ------------------: | -----: | -------- |
  | `- item` / blank / `    [^1]:`    |                   2 |      4 | **2**    |
  | `- item` / blank / `     [^1]:`   |                   2 |      5 | **2**    |
  | `- item` / blank / `      [^1]:`  |                   2 |      6 | no def   |
  | `- item` / blank / `       [^1]:` |                   2 |      7 | no def   |
  | `1. item` / blank / `    [^1]:`   |                   3 |      4 | **4**    |

  So a bullet host reports its CONTENT column at indents 4 and 5, and at 6 the line is
  indented code relative to that column and there is no definition at all — which is why
  the referee's rows looked capped: its documents are dense, and whatever host they sit in
  is not the one the shape suggested. The ordered host reporting the bracket at the same
  indent is the real asymmetry, and the gap between indent and content column (2 against 1)
  is the axis that separates them.

  This is the probe wave earning its cost in the usual way: not by closing cases, but by
  killing a rule that read as obvious from referee data alone. The warning above about
  inferring rules from pattern-matched corpus data now has a second instance. **Probes are needed before any of it is treated as a rule**;
  inferring one from pattern-matched corpus data has already produced a wrong answer once,
  which is why the `%%` rules in `corpus.ts` are recorded instead.

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

## Their vendored list reader has nothing left to give

The reference-implementation route's most concrete artifact: `obsidian-footnotes` vendors
`remark-parse` 8.0.3's list tokenizer because one had to change, and its header names exactly
what changed. Two things, both documented in place:

- **The de-indent minimum.** `remark-parse` strips an item's continuation lines by the
  SMALLEST indentation among them, so a lazy line at zero made that minimum zero, nothing was
  stripped, and every four-space line after it became indented code. Obsidian leaves
  unindented lines out of that minimum.
- **The task box.** Any one character, `/^\[(.)][ \t]/` in Obsidian's own `app.js`, so `[/]`,
  `[-]` and `[>]` are boxes and `- [/] [^a]: text` is a definition inside a task item.

**Neither is a gap here.** The first has no analogue to port: micromark computes an item's
content column per line rather than stripping a whole item by a minimum, so the pass that
needed patching does not exist, and the BEHAVIOUR it produces is already ours -- `- a` /
`lazy` / `    [^1]: def` and four siblings all match live Obsidian. The second is
`customTaskChars`, and all four box characters match including the definition's position and
the recorded task character.

So the one tokenizer they had to vendor is the one we do not need, which is the cleanest
available answer to "should we adopt their parser". The value in that project is its
MEASUREMENTS -- the rules document, the lettered comments in its source, and the recorded
oracle this harness uses as a referee -- not its code. Its architecture solves a problem
`remark-parse` 8 has and micromark does not.

### ...except B3 IS a gap, and the five siblings above were the wrong five

The paragraph above is kept because its conclusion about ADOPTING their parser still holds and
its premise does not. "The behaviour it produces is already ours -- `- a` / `lazy` /
`    [^1]: def` and four siblings all match live Obsidian" is true of those five and false of
the rule. Every one of them has its continuation line at column ZERO, which is the half of B3
that says Obsidian leaves unindented lines OUT of the minimum -- so they could not have
distinguished the two readings. One space is what separates them:

| note                                   |   obs | ours |
| -------------------------------------- | ----: | ---: |
| `- a` / `lazy` / `⟨4sp⟩[^1]:`          |     2 |    2 |
| `- a` / `⟨2sp⟩b` / `⟨4sp⟩[^1]:`        |     2 |    2 |
| `- a` / `⟨1sp⟩lazy` / `⟨4sp⟩[^1]:`     | **1** |    2 |
| `-⟨3sp⟩a` / `⟨1sp⟩lazy` / `⟨4sp⟩[^1]:` | **1** |    4 |

So an item's content column really is the SMALLEST indentation among its own lines, counting
only the indented ones, and we report the marker's width instead. The probe set that cleared
this rule was chosen from their document's own example, which is a column-0 case, and five
variations of a column-0 case are one case.

**It is the largest enriched family on this oracle.** 895 documents hold an item with a
continuation line indented below its marker's content column, and 354 of them disagree against
a 19.3% base rate -- a 2.05x lift, beside the container-opened `%%` class at 2.17x over 207.

And it is the one open item that is genuinely a NEW RULE rather than an extension, which
matters because every fix that has landed here recently was a widening of something already in
the tree. It governs three things at once -- the definition's column, where indented code
begins, and which lines continue the item -- so it belongs in `legacy-list.ts`, the vendored
reader this package already replaces `list` with, rather than in a repair pass. That is exactly
the file the sibling project patched, for exactly this rule.

The usual caution applies before anyone starts: 354 is the documents the shape TOUCHES, not the
gain. The tab family touched 426 and capped at ten.

#### ...and that caution was the whole story: the lift is a CORRELATE

Scored before anything was built, five times, and the sequence is the result:

| premise                                         | better | worse |
| ----------------------------------------------- | -----: | ----: |
| host by line range, minimum across overlaps     |  **0** |   521 |
| host by tree containment, innermost item wins   |  **0** |   117 |
| minimum measured after the container's prefix   |  **0** |   119 |
| minimum over the item's own lines, to 1st blank |  **0** |   115 |
| ...and the checkbox folded into the marker      |  **0** |    83 |

Every step fixed a genuine defect in the PREDICATE -- a definition our tree places inside an
item but past a blank line was never reached, `definition-column.ts` records that the INNERMOST
item owns the column, the corpus's shaped documents measure indentation after a container's `>`
run rather than from column zero, lines belonging to nested blocks were entering the minimum,
and `- [ ] ` is six columns of marker where the regex read two. **Each one reduced the losses
and not one produced a gain.**

That last step is the most useful of the five, because it improved the number for a false
reason. Folding the checkbox in helped by making the rule DECLINE on task items -- and a probe
added afterwards, `- [ ] a` / `⟨6sp⟩[^1]:`, reports NO definition, which means a task item's
content column is 2 and the checkbox is CONTENT. So the premise the edit encoded is wrong and
the score still moved 115 to 83. **A predicate's score can improve because it stopped firing**,
which is the inert-probe failure mode wearing the opposite disguise: here the number moved, and
the movement still carried no information about the rule.

**Zero better over 1,833 shaped documents.** The corpus holds the shape in abundance and not one
of its answers is reached by this rule, while the probes against live 1.14.4 show the rule
plainly. Both things are true, and together they say the corpus cannot adjudicate it: its shaped
documents are items inside quotes and callouts, where indentation is measured from the
container's content column rather than from column zero, and a ROOT item with a sub-content
continuation whose definition column actually differs is not among them.

So **the 2.05x lift was a correlate, not a cause** -- the shape marks a document as HARD rather
than naming what is wrong with it. That is the tab family's signature exactly, at 2.06x over 426
documents with a demonstrated ceiling of ten. It is the fifth selector to die here and the first
to die after surviving a base-rate test, which is worth stating because the base rate was
introduced precisely to stop this: **a lift says the shape and the difficulty travel together,
and still says nothing about which way the causation runs.**

What survives: B3 is a real rule, confirmed by probe and still unimplemented, and it is still
the one open item that is structural rather than an extension. What does not survive is the
claim that it is the largest actionable family. Its size on this oracle is unmeasured, because
this oracle cannot see it -- and the instrument that could is a probe wave against the
application, which is where these notes already send every rule whose premise is structural.

#### So: it CAN be implemented, and what blocked it was having no gate

Ten probes against live 1.14.4 state the rule with nothing left ambiguous, and they are in
`goldens/rules-doc.json` with `rules-doc.test.ts` asserting them:

    - a / lazy(col 0)  / ⟨4sp⟩[^1]:    col 2   a column-0 line is EXCLUDED
    - a / ⟨1sp⟩lazy    / ⟨4sp⟩[^1]:    col 1   an indented one is counted
    - a / ⟨2sp⟩b       / ⟨4sp⟩[^1]:    col 2   the minimum IS the marker width here
    -⟨3sp⟩a / ⟨1sp⟩lazy / ⟨4sp⟩[^1]:   col 1   marker width 4, answer still 1
    1. a / ⟨1sp⟩lazy   / ⟨4sp⟩[^1]:    col 1   ordered marker, same rule
    - [ ] a / ⟨1sp⟩lazy / ⟨4sp⟩[^1]:   col 1   task marker, same rule
    > - a / >⟨2sp⟩lazy / >⟨5sp⟩[^1]:   col 3   after the container prefix, made absolute
    - a /              / ⟨4sp⟩[^1]:    col 2   no continuation to minimise over
    - a / lazy(col 0)  / ⟨8sp⟩[^1]:    NONE    8 - 2 >= 4, so indented code
    - [ ] a /          / ⟨6sp⟩[^1]:    NONE    6 - 2 >= 4, so the checkbox is CONTENT

`column = min(marker content column, indentation of the item's indented lines)`, with the code
threshold measured from that same column. **Five of the ten already agree**, which is what makes
the other five the rule rather than a shape -- and the two reporting NO definition are the
boundary, so an implementation that lowers a column too eagerly fails the gate from the other
side.

Two things are NOT blockers, and saying so is the point of having checked:

- **The tokenizer site.** `legacy-list.ts` fixes `containerState.size` when the marker is read,
  and B3 needs lines that do not exist yet, so the vendored reader cannot host it as written --
  which is what "`remark-parse` strips a whole item by a minimum and micromark does it per line"
  means in practice. That makes it a post-pass or a buffered whole-item read, not impossible.
- **The 83 losses.** Every one inspected is the predicate under-measuring a content column in a
  compound container -- `- [ ]⇥laborum`, and `2)  > [!NOTE]- [^注1]:` where the real column is
  15 and the regex computes 4. Those are fixable; fixing them is what took 521 to 83.

The blocker was the third thing: **there was no instrument that would tell anyone a correct
implementation was correct.** The referee gains zero however the minimum is measured, the
3,403-case corpus holds no instance, and this file's own standing rule is that a clean
measurement against a corpus which cannot adjudicate a rule is not evidence and reads exactly
like evidence. Ten recorded cases is that instrument, and both halves of it are break-tested --
dropping an entry and corrupting a recorded column each fail the gate.

#### Landed: four of the five, at zero cost on both oracles

`deIndentFloor` in `definition-column.ts`, folded into `contentColumn` -- which already carried
the five-space cap, the single-digit-dot arithmetic and the tab-stop handling that all five
scored premises kept re-deriving and getting wrong.

    rules-doc    4 of 5 B3 position cases now agree
    corpus       0 regressions
    referee      5502/6818, agreeing set BYTE-IDENTICAL by --ids

The zero is the point, and it is why the probes had to come first: measured the usual way this
reads as a change that does nothing. **A fix with no measurable effect on either standing oracle
is exactly what a rule looks like when the oracles cannot see it** -- and one with a probe gate
behind it is the only kind that can be told apart from a no-op.

#### And the fifth was bought back at a measured price, so it was not bought

The quoted host is a different code path rather than a smaller version of the same one:
`contentColumn`'s `MARKER` is anchored at column 0, so `> - a` never reached the host branch and
the quote branch answered 2 where Obsidian reports 3. Making the function prefix-aware and
letting the item outrank the quote scores **0 corpus regressions and referee 5502 to 5500** --
`-2` by identity, 2 lost and 0 gained, for one probe. Reverted.

Both losses name the cause and it is not the arithmetic:

    > [!note] / >⟨3sp⟩[^1]: def / >⟨5sp⟩- item        answer column 2
    > [!note] / >⟨4sp⟩[^ch2*]: body / > $$ / ...      answer column 2

A quoted definition takes the QUOTE's content column even when a list item exists in the same
container, so `Math.max(quote, host)` is the wrong combinator -- the quote wins. The probe
differs because its definition sits inside the item that OPENS the quote's content, where in
both of these the item is a sibling our `items` map claims anyway: a pre-order `visit` into
every `listItem` maps whatever that item's span covers, and after absorption that span reaches
further than Obsidian's host does.

Which is **the contaminated host identification this file already records**, met from the
opposite direction. There the tell was Obsidian answering a column that was neither the host's
nor the bracket's; here it is a quote outranking a host we should not have found. Same
conclusion both times: our innermost `listItem` is not always Obsidian's host, and until a host
test can express the difference, rules keyed on it have a ceiling that is not about the rule.

### "The referee cannot see B3" was wrong, and the blast radius is how you find out

Everything above concludes that this oracle cannot adjudicate B3. That is **false**, and the
measurement that shows it is one nobody had run: not "how many documents hold the shape" but
**how many documents does the landed rule actually change the answer for.**

Dumping every definition for all 6,818 documents with the fix in and with it out:

    documents compared : 6818
    documents CHANGED  : 4

Four. Not the 1,833 that hold the shape. And all four are `probes.json` entries -- **the sibling
project's own designed B3 probes**, with Obsidian's recorded answer sitting right there:

| document            | note                                  | referee `defs` |
| ------------------- | ------------------------------------- | -------------- |
| `probe:k-dash3-2-6` | `-⟨3sp⟩a` / `⟨2sp⟩b` / `⟨6sp⟩[^1]: x` | **`[]`**       |
| `probe:k-dash3-1-5` | `-⟨3sp⟩a` / `⟨1sp⟩b` / `⟨5sp⟩[^1]: x` | **`[]`**       |
| `probe:k-ord-1-6`   | `1. a` / `⟨1sp⟩b` / `⟨6sp⟩[^1]: x`    | **`[]`**       |
| `probe:k-dash-1-5`  | `- a` / `⟨1sp⟩b` / `⟨5sp⟩[^1]: x`     | **`[]`**       |

**No definition at all**, because the lowered column moves the indented-code threshold with it.
The two halves are one rule and they agree on every case once both are applied:

    - a / ⟨1sp⟩lazy / ⟨4sp⟩[^1]:    floor 1, 4 - 1 = 3 < 4   definition at column 1
    - a / ⟨1sp⟩b    / ⟨5sp⟩[^1]:    floor 1, 5 - 1 = 4 >= 4  CODE, no definition

So the landed fix is **correct and incomplete**, and the referee could say so all along. What
hid it is that these four documents disagree before AND after, so the agreement total and even
the `--ids` identity diff are both silent -- a document that is wrong in a new way is not a
document that moved.

**The rule for the next person: measure the blast radius, not the shape count.** "How many
documents hold this shape" counted 1,833 and told me nothing; "how many answers does my change
alter" counted 4 and handed me an oracle with Obsidian's own answers in it. The first is a
property of the corpus, the second is a property of the change. Five scored premises and a
landed fix went by before anyone asked the second question.

#### The threshold half, scored twice, and the unit bug it exposed

    floor re-derived in the scorer    better 28  worse 48  agreement -37
    floor from `contentColumn`        better 20  worse 17  agreement -12

The first read `1.⟨5sp⟩` as seven columns where the five-space cap makes it four -- the **sixth**
premise about this quantity refuted by its own arithmetic rather than by the rule. That is now
structurally prevented: `contentColumn` is exported and `score.mts` calls it, so the scorer and
the pass cannot disagree.

The second still loses 17, and they are **a unit mismatch in the shipped function**:

    - a / ⟨4sp⟩- b / ⇥⇥- [^1]: def     answer column 4, the candidate drops the definition

`contentColumn` returns `opener[0].length`, which is CHARACTERS, while the threshold compares an
indent in COLUMNS with tabs expanded. For `⇥⇥- ` that is 4 against 8, so the threshold fires on
an item whose content begins exactly where its definition does. Both halves of B3 need one
unit, and choosing it edits the shipped column answer rather than the candidate -- so the
threshold stays unshipped with its number attached.

Note the shape: positive on DISTANCE, negative on AGREEMENT. This file has seen it once before,
on F5, and both times it meant the rule was right and its boundary wrong.

### `--blast`: the bucket both cheap checks are blind to, made a tool

B3 was found by hand. The general form is cheap enough to be the default, so it is now part of
the gate rather than a scratch script -- `referee.mts --dump <file>` records every answer and
`--blast <file>` diffs against one, using the gate's OWN comparison:

```bash
git stash && npx tsx --conditions=development test/parity/referee.mts --dump /tmp/before.json
git stash pop && npx tsx --conditions=development test/parity/referee.mts --blast /tmp/before.json
```

Four buckets, and only three of them were ever visible:

| bucket            | what it is                                      | seen by                |
| ----------------- | ----------------------------------------------- | ---------------------- |
| `gained`          | disagreed, now agrees                           | the total, and `--ids` |
| `lost`            | agreed, now disagrees                           | the total, and `--ids` |
| `equivalent`      | both spellings agree -- slack in the comparison | nothing, and harmless  |
| **`still wrong`** | **rewritten where the oracle rejects BOTH**     | **nothing at all**     |

A document in the last bucket never changed side, so the identity diff is empty, and the total
is unmoved. Verified by replaying the B3 commit through it: **4 answers altered, 0 gained,
0 lost, 4 still wrong**, with the oracle's `defs: []` printed beside each.

#### Run over this whole session's `src` work, it found 23 more

    answers ALTERED : 117 of 6818
      gained       87
      lost          3
      still wrong  27
      equivalent    0

| what the change did | where the oracle sits       | docs |
| ------------------- | --------------------------- | ---: |
| moved a definition  | same count, different place |   13 |
| moved a definition  | wants FEWER                 |    7 |
| moved a definition  | **wants NONE**              |    5 |
| moved a definition  | wants MORE                  |    1 |
| added a definition  | same count, different place |    1 |

The five wanting NONE are B3's threshold family and the bucket is **5, not the 4** a hand-rolled
dump of the single commit found -- `reproducers.json#614` reads `[^note]` at column 3, we moved
it to 2, and Obsidian has no definition there at all. With the 7 wanting FEWER that is **12
documents saying we emit definitions Obsidian does not have**, which is one target rather than
twelve leads.

And `broad-20261004.json#70` is the clearest statement of what the bucket is for:

    before = [["3",4,0,5], ["注1",9,8,10], ["12",16,4,16]]
    after  = [["3",4,0,5], ["注1",9,8, 9], ["12",16,2,16]]
    oracle = [["3",4,0,5], ["注1",9,8,11], ["12",16,2,16]]

One session, one document: `12`'s column was fixed from 4 to 2, which the oracle wants, and
`注1`'s END was moved from 10 to 9 where the oracle wants 11. **An improvement and a regression
in the same document, cancelling into silence** on every instrument that reads a per-document
verdict. The blind spot is not really about documents at all -- it is that agreement is a
CONJUNCTION over fields, and a conjunction that is already false absorbs any number of further
changes.

#### It also found 3 documents this session lost without noticing

`broad#12`, `broad#94` and `fuzz-20261003#202` agreed at the start of the session and do not
now. One is recorded -- `item-dot-threshold` landed at `+6/-1` and said so -- and the other two
went through steps where only the TOTAL was checked, which cannot tell a hold from a trade.
This file already carries that lesson ("verify a HOLD by identity, not by its total") and the
gap was that `--ids` was run on the steps where a wobble was predicted rather than on all of
them.

So the standing rule tightens, and it is cheap now: **dump before, blast after, every src
change.** The total answers "did it help", `--ids` answers "which documents moved", and only
`still wrong` answers "did I rewrite an answer into a different kind of wrong" -- which is the
question a half-implemented rule needs asked.

### Is that all of them? The surface is countable, and it is almost entirely one oracle

Worth asking rather than assuming, because the obvious reading is that every gate here has the
same hole. **The blind spot's size is exactly the number of units that currently DIVERGE** -- an
agreeing unit cannot be rewritten into a different wrong answer, and a unit that starts
agreeing or stops is already reported. So the exposure per oracle is countable:

| oracle                        | units | currently diverging | instrumented           |
| ----------------------------- | ----: | ------------------: | ---------------------- |
| referee `defs`/`refs`         | 6,818 |           **1,316** | `referee.mts --blast`  |
| corpus, ~10 projections each  | 3,403 |               **5** | `delta.mts --blast`    |
| `compose` 7 axes, binary rows | 1,152 |               **5** | no, and see below      |
| rules-doc                     |    76 |                   6 | exact-set assertions   |
| invariants, spans, round-trip |     - |                   - | absolute, not relative |

**1,316 of the ~1,330 diverging units in the whole harness are in the referee**, which is why
that is where the 27 were and why it was worth a flag. The last row does not participate at
all: those gates assert a property rather than compare against a recording, so there is no
"different kind of wrong" for them to absorb -- a span either overlaps or it does not.

`delta.mts --blast` exists now too, and the answer it gives is the useful kind of boring:

    answers ALTERED : 0 of 3403
      gained 0    lost 0    still wrong 0

**Zero**, over this session's entire 24 commits of `src`. Not one corpus answer changed, which
is the same fact these notes keep recording from the other side -- the shapes those rules fire
on have no instance in the corpus at all. And because a zero from a new instrument is
indistinguishable from an inert one, it was break-tested: tampering with three baseline entries
reports `1 gained / 2 still wrong` with their triage states, so the instrument works and the
corpus really is insensitive to this work.

The break test also produced the number that bounds everything: **only 5 of 3,403 corpus cases
diverge at all.** So that gate's entire blind-spot surface is five cases, whatever its
projection count, and it is measured at zero.

`compose` is the one left uninstrumented, deliberately. Its rows are binary, so it has the hole
by construction -- and its surface is the 5 rows that remain, four of which are the P1 cache
defect that must not be fixed and one scored-and-declined. A flag there could find at most five
things, all of which are already written down.

So: **the hole was real, it was one oracle, and it is now the one that reports it.** The honest
residual is that `--blast` compares `defs` and `refs` only, because that is what the referee
records -- a change that rewrites `sections` geometry between two wrong answers is still
invisible on 6,818 documents, and `compose` is the gate that would have to say so.

### The geometry half, closed: `compose.mts --dump/--blast`

`compose` is the gate holding `sections`, and its rows were the binary ones -- `agrees(want,
got)` collapses eight projections to a boolean, so a row diverging before and after reports the
same `1` either way. The same two flags now sweep **all seven axes**, 1,152 rows, and name which
projections moved:

    rows ALTERED : 15 of 1152
      gained 15    lost 0    still wrong 0

    projections that moved:   sections 14   defs 3   headings 2   refs 1

Fifteen rows, every one into agreement, and **nothing rewritten while still diverging**. The
moved projections are overwhelmingly `sections`, which is the point: that is the geometry no
other instrument here records.

Break-tested, and the first attempt was itself wrong in a way worth keeping. Tampering two
baseline rows reported nothing new, because the rows picked were ones this session FIXED -- so
they were already in the `gained` 15 and the tamper changed which bucket they would have been
in, not whether they appeared. Picking rows that diverge **both before and after** reports
`still wrong 2` with `sections` named. **A break test has to break something the gate would
otherwise be silent about**, and a row that already moved is not that.

That re-pick also measured the surface directly instead of taking it on trust, and it is exactly
what these notes claimed: **5 rows diverge both before and after** --
`nested/quote > callout > footnote`, the scored-and-declined nested-definition column, and the
four `inline-block/comment [ ... ]` rows that are the P1 cache defect which must not be fixed.

### The instrument inventory, and the one hole left

| gate                          | diverging units | assertion                | hole     |
| ----------------------------- | --------------: | ------------------------ | -------- |
| `referee.mts`                 |           1,316 | total + `--blast`        | closed   |
| `delta.mts` (corpus)          |               5 | triage lists + `--blast` | closed   |
| `compose.mts`                 |               5 | binary rows + `--blast`  | closed   |
| `compute.test.ts` CEILING     |          **18** | **per-field COUNT**      | **OPEN** |
| `compute.test.ts` gaps list   |               n | exact set, by identity   | none     |
| `rules-doc.test.ts`           |               6 | exact set, by identity   | none     |
| invariants, points, roundtrip |               0 | absolute property        | none     |

`CEILING` was the last one, and it had the hole for the reason the referee total did: it asserted
`{footnotes: 2, footnoteRefs: 4, sections: 1, links: 2, embeds: 2, blocks: 3, listItems: 4}` as
**counts**, so one case ceasing to diverge while another started held the number exactly. This
file already carried the lesson twice -- once as "verify a HOLD by identity, not by its total",
and once as the round-trip ceiling that could not tell untidy from unbounded and now asserts
emptiness instead.

**Closed by `CEILING_IDS`**, the same 18 as an exact set of `<case>:<field>` entries, asserted
by identity beside the counts. Break-tested the way the hole actually opens: swapping one entry
for another **within the same field** fails the identity assertion while the count assertion
still passes.

The conversion also showed what the count had been hiding all along -- **18 entries are
THIRTEEN cases.** `probe/def-gap/marker-tab-sep` diverges on `footnotes`, `listItems` and
`sections` at once, and `fuzz/embed/24` and `probe/caret-link/link-with-def` on two each. "18
divergences" was never 18 independent problems, which is a materially different backlog.

`CEILING` itself stays, because its per-field comments are where all thirteen are attributed and
a field count is the readable index into them; both assertions read the same `diverged` map, so
they cannot disagree, and the count test now also checks itself against the identity list.

### So every device is in order, and here is what each one can and cannot say

| gate                          | diverging | assertion                | hole   |
| ----------------------------- | --------: | ------------------------ | ------ |
| `referee.mts`                 |     1,316 | total + `--blast`        | closed |
| `delta.mts` (corpus)          |         5 | triage lists + `--blast` | closed |
| `compose.mts`                 |         5 | binary rows + `--blast`  | closed |
| `compute.test.ts`             |        18 | **identity** + counts    | closed |
| `rules-doc.test.ts`           |         6 | exact set, by identity   | none   |
| invariants, points, roundtrip |         0 | absolute property        | none   |

Every count-shaped assertion in the harness is now backed by an identity one, and every
comparative gate reports the `still wrong` bucket. The workflow for a `src` change is three
dumps and three blasts, and the thing to read is **`still wrong` on all three** -- the totals
only say whether it helped.

One residual worth stating because it is a property of the oracles rather than of the gates:
`--blast` can only speak for projections an oracle RECORDS. The referee records `defs` and
`refs`, the corpus records ten projections plus `meta.*` and `html.*`, and `compose` records
eight including `sections`. A rule that changes something none of the three records -- inline
positions inside a table cell, say -- is still unmeasured, and the answer there is a probe wave
rather than another flag.

### Auditing the tooling itself: the gaps were all the same gap

With every gate's blind spot closed, the next question is which TOOLS are known-incomplete and
simply never finished. Grepping this file for its own admissions -- "not gated", "by hand",
"opt-in", "wants re-running", "belongs in a scheduled job" -- turns up a single pattern rather
than a list of unrelated holes:

**Every `PARITY_*` opt-in exists and NOTHING sets it.**

    defined in the harness : PARITY_FULL_PROXY_CHECK  PARITY_OPTION_PAIRS
                             PARITY_FUZZ_FILE/FROM/COUNT  PARITY_GOLDEN_PATH
                             PARITY_REFEREE_DIR
    set by any workflow    : none

Two of those are not parameters, they are deferred work with a note explaining the deferral:

- **`PARITY_OPTION_PAIRS=1`.** `option-matrix.test.ts` sweeps single toggles and its own
  docstring says a two-option crash "belongs in a scheduled job rather than a push gate". The
  pair sweep was then written, behind that flag, with a one-hour timeout -- and the scheduled
  job was never created. So the axis is implemented, skipped on every run, and measured by
  nobody.
- **`PARITY_FULL_PROXY_CHECK=1`.** The Reading-View cross-check sweeps the seed layer on every
  recording and the whole corpus only under this flag, "when the goldens are re-recorded
  against a new Obsidian". Nothing enforces that either.

And one tool had no flag and no caller at all: **`fuzz/contradictions.ts`**, which this file
calls "the only selector in this harness that has not gone blunt" and says to "re-run after
every landing". A grep for `contradictions` across `test/`, `package.json` and `.github/`
found the script and one mention in this file.

**That is the lesson restated as a property of the repo rather than of a measurement.** These
notes already record what an unrun opt-in costs -- the Reading-View correction sat behind the
seven-minute flag and left a divergence in the backlog with no rule behind it, and the fix was
to make it automatic rather than recommended. The same mistake is in the tooling three times
over, and the tell is identical each time: a docstring that describes when someone SHOULD run
something.

#### Closed: the contradiction detector is a gate

`contradictions.ts` now exports its computation and `contradictions.test.ts` asserts the set is
**empty** -- not a count, for the reason every other ceiling here has stopped being one. It
reports zero today, which is exactly when a detector is worth gating: the cost is one assertion
and what it prevents is a contradiction appearing and waiting for someone to remember a script.
Every landing re-partitions the triage, so this is genuinely re-measurable rather than a
one-off audit.

Break-tested by flipping one `match` case to `replicate` so its shape holds both sides, which
fails with `"[[w]](w)"  1 diverging / 1 matching`. Registered in `overview.ts`, and the drift
gate refused the commit until it was -- the second time that registry has caught an unregistered
gate, after `rules-doc.test.ts`.

#### Closed: both unrun opt-ins now have a job

**`PARITY_OPTION_PAIRS=1`** runs weekly in `deep-checks.yml`, and it was MEASURED before being
scheduled rather than trusted to its timeout: 276 pairs against each preset, each parsing the
whole corpus, **~16 minutes, green**. The one-hour timeout in the test is headroom, not a
duration -- and scheduling a sweep nobody had seen pass would have been scheduling a red job.
Its own workflow rather than a job in `parity.yml`, because it needs no Obsidian and no display;
a failure opens an issue naming the reproduce command.

**`PARITY_FULL_PROXY_CHECK=1`** is now set on `parity.yml`'s recording step, which is precisely
the condition this file already stated -- "when the goldens are re-recorded against a new
Obsidian". The detached renderer is a PROXY for reading mode, so an unfaithful capture pins the
gate to behaviour Obsidian does not produce, and that is how a golden recording
detached-renderer output defeated several attempts to find a parsing rule for it. ~7 minutes
against ~80 seconds, which is free in a weekly job.

So the audit's score: of seven `PARITY_*` variables, five are genuine parameters
(`PARITY_FUZZ_FILE/FROM/COUNT`, `PARITY_GOLDEN_PATH`, `PARITY_REFEREE_DIR`) and the two that
were deferred work are now scheduled. **Nothing in the harness is now gated on someone
remembering to run it.**

### The last lesson without a tool, and it was already measured

Every doctrine in this file got an instrument this session except the most expensive one:

> A zero-regression measurement proves nothing if the corpus cannot adjudicate the rule.
> Before trusting one, **count the cases that exercise the rule** -- and if the answer is zero,
> the measurement has told you nothing.

That cost a shipped regression, and the guard against it was a one-line predicate re-written by
hand every time. **It needs no new tool, because `--blast` already computes it from the other
side**: `answers ALTERED` IS the count of cases a change exercises. A clean gate with zero
altered answers is not a pass, it is an absence of evidence -- and nothing said so.

All three blast tools now say it:

    answers ALTERED : 0 of 3403
      gained 0   lost 0   still wrong 0

      NO EVIDENCE. This oracle's answers are UNCHANGED by the edit, so it cannot
      adjudicate it -- a clean result here is not a passing one. [...]
      Reach for a probe wave (test/parity/ask.mts) instead of trusting this.

Checked both ways: it fires on the corpus for this session's `src` work, which really is
unadjudicable there, and it stays silent on the referee's 4 altered answers. **The two readings
that look identical on a summary -- "nothing broke" and "nothing was measured" -- are now
printed differently**, which is the whole of that lesson expressed as output rather than as a
habit.

### What still does NOT suffice, stated plainly

Three things, none of which a flag fixes:

- **`score.mts` re-derived what the passes compute.** PARTLY CLOSED. The tab-aware column
  measure had FOUR byte-identical copies in the scorer against one in `src`; `columnsOf` is
  exported from `item-dot-threshold.ts` now and the copies are gone, which makes drift on that
  quantity impossible rather than unlikely.
  Verified behaviour-preserving by re-scoring two recorded candidates: `0/83` and `20/17`,
  both unchanged. One number did move and it is worth reading --
  `b3-minimum-first-chunk`'s `same` fell 37 to 33 with `untouched` up by 4, which is exactly
  the four documents the shipped B3 fix now already handles, so the candidate no longer alters
  them. An independent confirmation of the fix, arriving from a refactor.
  What remains is the MARKER patterns, and they are deliberately left: the B3 candidates are
  recorded EVIDENCE, and rewriting a refuted premise's predicate changes the number its
  refutation rests on. So the rule for new work is the one that matters -- a candidate keyed on
  a content column must call `contentColumn`, as `b3-threshold-drops-definition` does, and any
  older refusal keyed on a hand-rolled marker is a lead rather than a verdict.
- **The probes are not in the corpus.** The 76 `rules-doc` cases and the 10 B3 cases are gated
  by their own goldens, which is why B3 was landable -- but they are not in `corpus.ts`, so the
  main gate and every sweep built on it still cannot see those shapes.

  **A previous version of this bullet said promotion "needs `parity:record`, which this project
  reserves for a human", and no such policy exists.** Nothing in this file says it; the running
  instructions are `nix develop` then `parity-record`, and the devshell provides `herbstluftwm`,
  `Xvfb` and the wrapper. The sentence was invented and then cited as a reason to decline work,
  which is the worst available form of the attribution error these notes already record five
  times -- the others misattributed a CAUSE, this one manufactured a CONSTRAINT. The weekly
  workflow never committing a recording is a review policy for DRIFT, not a prohibition on
  recording, and conflating the two is how it happened.

  Recording is a normal step. A rule that cannot be verified because the corpus holds no case
  for it is a reason to add the case, not to refuse the rule.

  **DONE.** `probe/def-deindent/*`, 14 cases, recorded against 1.14.4 -- corpus 3403 -> 3417,
  10 `match` and 4 `replicate`. The golden diff is additive (909 insertions, no re-encoding,
  zero `\uXXXX` escapes introduced) and the whole suite is green at 446 tests.

  Four groups, one per question. `lazy-*` and `no-continuation` cover the half that was always
  right -- a column-0 continuation is excluded from the minimum -- and had NO case before.
  `indented-*` cover the half that was wrong, across bullet, wide bullet, ordered and task
  markers, and all four now match. `code-*` are B3's unimplemented code threshold and are
  `replicate` with the scored numbers attached. `quote-indented-one` is the container-prefix
  half.

#### Promoting them exposed a blind spot in the MAIN gate

`quote-indented-one` reads `MATCH` on `compareCase` and genuinely diverges: our column is 2
where Obsidian's is 3. Both gates were right about what they compare, and that is the finding --
**`meta.footnotes` is NAMES ONLY.**

    meta.footnotes     ["1"]
    compute.footnotes  ["1@3:3-3:15"]

`compareCase` diffs `meta.*`, so the main gate cannot see a footnote COLUMN divergence at all;
positions live in `compute`, which is a separate test with its own ceiling. So a column-only
regression on any of 3,417 cases is invisible to `npm test`'s largest gate, and was until these
cases were added -- the promotion is what surfaced it, because every earlier column case had a
NAME divergence beside it.

This is the sixth instance of "check every oracle before calling a family clean" and the first
where the weaker oracle is the primary one. It is recorded rather than fixed: widening
`meta.footnotes` to carry positions would duplicate what `compute` already asserts by identity,
and the honest fix is to know which gate answers which question. **A footnote column question
goes to `compute.test.ts`; the main gate answers existence and text.**

The four `code-*` cases landed in `compute.test.ts` as nine new `CEILING_IDS` entries and four
`KNOWN_REFERENCE_GAPS` entries -- `footnotes` 2 -> 7 and `footnoteRefs` 4 -> 8, since a
definition we invent also resolves a reference Obsidian does not index.

- **Oracle coverage, which is not a gate property at all.** PARTLY CLOSED. The
  `footnoteRefs` half is now `ask.mts --synth`: it appends a definition for every referenced
  name and asks again, so a reference Obsidian would not otherwise report becomes visible.
  `text[^1] more` answers `[]` plain and `1@0:4` synthesised.

  **It carries its own safety check, and needed two goes.** Appending at the end leaves every
  original offset intact, but an unclosed `%%` runs to the end of the note and SWALLOWS the
  appended definitions -- so `refs: []` can mean "the probe never fired" rather than "Obsidian
  indexes nothing". Three conditions now: the original region's `footnotes` and `sections` must
  be untouched, and the synthesised definitions must actually have DEFINED. `%% [^2] buried`
  correctly reports `safe=false`.

  The first version also scanned the source for `[^x]:` labels and skipped those names, which
  is wrong in precisely the case the flag exists for: `> %%` / `[^3]: Text` HAS a label and
  Obsidian defines nothing, so the scan skipped the one document that needed augmenting and
  returned an empty `refs` that read like an answer. Eighth instance of an inert probe looking
  exactly like a working one. Augmenting every referenced name unconditionally fixes it -- a
  duplicate definition is harmless, since the first wins -- and the result reproduces a
  measurement these notes previously made by hand: `3@1:0`.

  What remains is genuinely the application: 8 of 14 inline constructs report nothing to
  `metadataCache`, and `P1`/`P2` are cache defects that must NOT be reproduced, so four
  composition rows and several positional ones have a floor above zero by design. No instrument
  closes those.

So the measuring devices are in order and two known-weak spots remain inside them: the scorer's
re-derivations, and the corpus's blindness to the probe shapes. Both are tractable and neither
blocks working the referee queue, as long as a refusal from `score.mts` is treated as a lead
rather than a verdict.

## Tracing their SOURCE finds rules their document does not letter

Their rules document was mined once and gave five gaps, all now closed. Their source is a
second, richer vein: `src/parsing/` is 4,253 lines and its comments carry rule letters WITH
evidence counts, which the document does not. Grepping for those letters turns up
`C4 C5 F5 M2` -- four that the document's prose never numbers and that the earlier audit
therefore never checked.

Three are marked "Stock", meaning `remark-parse` already does them. **F5 is Obsidian's own**,
and it is the rule that explained the single unexplained note in their first three thousand:

> An opener indented four spaces still ends a list item. `1. p` / `  10.     q` / `    %%`
> ends the list and is read as top-level indented code; a tab, six spaces, or plain text in
> its place stays in the item.

Confirmed against live 1.14.4 with all three controls, and **we already get F5 itself right**.
What we get wrong is every control: where the line stays in the item, the column-0
`[^1]: def` below it is lazy continuation and defines NOTHING, and we report a definition in
all three.

So the find is not F5 but its complement, and scoring it says why it is hard:

| scoping                                   | better | worse | agreement |
| ----------------------------------------- | -----: | ----: | --------: |
| everything after a marker to a blank line |    160 |   161 |      -101 |
| ...genuine lazy continuation only         |     60 |    45 |       -30 |
| ...and frontmatter excluded               |     59 |    45 |       -30 |

160 better is the largest signal any candidate has shown here, and the rule is net positive
on DISTANCE while still negative on full agreement -- 30 documents that agreed exactly no
longer do. Each refinement is a line of container tracking reimplemented badly in the
scorer, which is the same structural wall every line-local approach here meets: expressing
"this line lazily continues that item" needs the parser's container state, not a scan.

The lesson for the method rather than the rule: **their source is worth tracing for rules
their prose omits**, and a rule that scores well on distance and badly on agreement is one
whose SHAPE is right and whose boundary is wrong.

### ...and this is the first rule the SCORER cannot express

Narrowing it four times, each from an example the previous scoping made worse:

| scoping                              | better | worse | agreement |
| ------------------------------------ | -----: | ----: | --------: |
| everything after a marker to a blank |    160 |   161 |      -101 |
| genuine lazy continuation only       |     60 |    45 |       -30 |
| after a list+indented run, no blank  |     68 |    40 |       -23 |
| ...and the label at column 0         |     31 |    20 |       -15 |

Every scoping is net positive on DISTANCE and negative on AGREEMENT, and each halves the
loss without flipping it. That combination has not appeared for any other candidate: the tab
rule had a hard ceiling of ten, the fence rule sat at exactly break-even, and both reference
rules were catastrophic. This one keeps improving as it narrows.

The tree says why. `- a` / `lazy` / `[^1]: def` ALREADY WORKS -- `containerLazyTransform`
absorbs the plain lazy line and the definition with it -- so the broad rule was covering
cases that pass. The real gap is the F5 control, where a tab-indented `%%` after a list
becomes a ROOT `code` node and breaks the absorption chain, leaving the definition below it
reported where Obsidian swallows it.

Expressing "this line lazily continues that item" needs to know whether the item is still
OPEN, and a backward line scan cannot: every remaining `worse` is a column-0 definition
after indented content where the item had in fact closed. **We have that state -- in the
tree -- and the scorer does not**, because a scored rule transforms facts rather than nodes
by design.

So this is the first candidate whose negative score is a limit of the SCORER rather than
evidence against the rule, and the two outcomes must not be confused.

### Giving the scorer the tree flipped it by 36 documents

The limit was self-inflicted. `refereeFacts` parses a tree and discarded it, so a rule could
only see text -- and the stated reason was that a scored rule should need "no tree surgery",
which conflates READING the tree with MUTATING it. Only the second is order-dependent. The
tree is already parsed, so reading it is free, and a rule still returns facts.

Asking the same rule of the tree instead of a backward scan:

| version                           | better | worse | agreement |
| --------------------------------- | -----: | ----: | --------: |
| line scan, four scopings, best of |     31 |    20 |       -15 |
| **the tree**                      | **82** |    26 |   **+21** |

A root `footnoteDefinition` at column 0, reachable back across adjacent root siblings to a
`list` with no blank line between any pair, is swallowed by that list. The scan could not tell
whether the item was still open; the tree can, because an absorbed definition is a root
SIBLING of the list rather than a child of it.

**That is the first net-positive rule on agreement found here**, and it was hidden behind one
line of the harness's own design. The lesson is about the tool rather than the rule:
**withholding information from a measurement to keep it cheap can cost more than the
measurement saves** -- four scopings of this candidate were spent approximating state that was
sitting in a discarded variable.

**And it landed, at +43 documents.** `containerLazyTransform` now accepts an indented-code
node after a list, which is what the chain needed: the tab-indented `%%` arrives as a root
`code` node and breaks the absorption, so accepting it lets the pass reach the definition it
already accepted. Two details were measured rather than assumed:

- The pass runs its loop BACKWARD and absorbs at most one sibling per container, so a
  `list` / `code` / `footnoteDefinition` chain collapses one link per pass. It now repeats
  until the child count stops falling.
- Fenced code had to be excluded. A bare ``` arrives as `code` with a null `lang` exactly as
  indented code does, so the node type cannot tell them apart and the source line has to --
  accepting both cost `list/fence-interruption` and `hunt/gen-list-fence-outlives-item/9`,
  because a fence after a list is its own block and the list genuinely ends at it.

referee 78.3% to **78.9%**, 0 parity regressions, round-trip unchanged at 19 unstable. The
scored prediction was +21 and the implementation delivered +43, which is the right direction
for a scorer to be wrong in: it reads only the facts a rule rewrites, while the pass also
fixes the `sections` and `listItems` those documents disagreed on.

**And the obvious generalisation is refuted in one run.** Reaching back to any container
rather than a list -- a quote or a callout, which `containerLazyTransform` treats alike
everywhere else -- scores **3 better against 31 worse, agreement -27**. So the absorption is
LIST-SPECIFIC: a list swallows a following column-0 definition and a quote does not.

That is the third measured instance of lists and quotes differing here, after the setext
underline (a quote gives up its last lazy line to a heading, a list does not) and this pass's
own `html` and `heading` entries (both restricted to a list for the same reason). The scoped
fix was right and the general one would have cost 27 documents -- which is exactly the trade
the scorer exists to find before a pass is written rather than after.

**Widening the CHAIN is refuted too.** `code` was the link that broke it, and the other node
types that can sit between a list and a definition are `thematicBreak` and a link-reference
`definition`. Letting the chain survive those scores **3 better against 23 worse, agreement
-20**: a thematic break and a link-reference definition are real blocks that end the list,
where indented code is continuation.

So two adjacent widenings were tested and both cost ~25 documents, which puts the landed
scoping at a **local optimum** -- `code` after a `list`, and nothing more. Two runs to
establish that, against the four implementation cycles the comment fold cost to establish
less.

## What the sibling project does differently, and what its 99.2% measures

`obsidian-footnotes` reports 99.2% agreement on the corpus this harness vendors as its
referee, where we report 75.4%. Both halves of that gap are worth knowing, and neither is
the one I assumed.

**Their comparison is looser in three specific ways**, from `scripts/oracle/compare.mts`:

- A definition is matched by `(line, folded name)` and its **column is never compared** —
  stored in the answers, never read. Our referee compares `[name, line, column, lastLine]`
  exactly, so our whole `startCol` family is invisible to theirs.
- A definition's end is compared after two normalisations: `lastLine` pulls an end at column
  0 of a later line back one line, applied to OBSIDIAN's side when packing, and `trimmedEnd`
  strips trailing blank lines from the reader's.
- References are compared by `(line, column)` strictly, but obs references with an empty
  name are dropped, inline ids are dropped, and a reader reference whose name is in the
  answer's `unknown` list is skipped. Empty inline footnotes alone were ~1,300 of 20,000
  notes in their run.

Implementing their comparison against our tree gives **78.81%**, so the metric accounts for
about three points of the gap and not twenty-four.

**The rest is architecture.** They parse with `remark-parse@8.0.3`, `remark-footnotes@2.0.0`
and `remark-math@3.0.1` — the actual generation Obsidian forked — and add Obsidian's rules
as named tokenizers through remark-parse's own extension points, vendoring the list reader
and the tokenizer loop. We parse with micromark and repair toward the same target in ~70
passes. That is not a gap we can close by copying: this package exists to be a remark plugin
inside Quartz's modern unified pipeline, and remark-parse 8 cannot sit in it.

**What IS transferable is their rules document**, `docs/obsidian-reading-rules.md`: 145 lines,
every rule lettered and stated in plain sentences, derived clean-room from the same oracle.
Thirty-three of its examples were run against this package directly; **thirty matched**.

Already correct here, and worth naming because each took work to get right: A2/A4 (a callout
title stands alone, and text after the marker is block content), A3 (only the quote's first
line can be a title), B1 (a tab after a marker starts an item, two tabs are code), B4 (a
column-0 label under an item defines nothing), B8 (a task box holds any one character), C1
(a label line ends a piped table), D1 (wikilink extent, including `[[a [[b]] [^5]]]` leaving
`[^5]` live), D2 (frontmatter closing-line rest is Markdown), D3 (a setext underline under a
label), D5 (`%%` does not end a definition), E2 (`[^1]: [^2]: x` is two definitions), E3
(everything inside `^[...]` is dead), F1 (an opener holds no other `%`, so `%%%` and
`%% 50%` are paragraphs), F3, B9 (two lists with only blank lines between them are one
list), B3 (a lazy line is left out of an item's minimum indent), M1 (`$$` pairs from the
left).

**One gap found and fixed: E4**, the 1,024-character interrupt window — see
`definitionWindowTransform`.

**Four gaps found and queued, with their size in the referee corpus:**

| rule | what Obsidian does that we do not                                                                                                                                                                                            |                                  corpus |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------: |
| A2c  | **CLOSED** by `calloutTitleInterruptTransform`. A callout title is not a paragraph, so an ordered item below it opens a list whatever its start number — both controls hold                                                  | **0 in the referee corpus** (see below) |
| F4   | **CLOSED.** A comment opened inside a quote needs its closer inside too, so a column-0 `%%` cannot close it — see `commentQuoteExtentTransform`. The quote's own extent is still wrong there, which no corpus case exercises |                                  was 12 |
| C3   | **CLOSED** by `tableLabelRowTransform`. In a pipeless table a label line holding a pipe is a ROW — the pipe is the axis, confirmed against three controls                                                                    |            **4** actionable of 7 shapes |
| E5b  | **CLOSED.** A name may not hold ASCII whitespace, so `a[^x [y]` is no reference at all — see the guard in `footnote-bare.ts`                                                                                                 |                                   was 3 |

E5b carries its own trap, and the goldens have it both ways: zero Obsidian entries here hold
ASCII whitespace in a name, while the referee's answers hold **six** that are `a\u00a0b` and
`a\u3000b` — a no-break and an ideographic space. So the rule rejects ASCII whitespace and
must keep accepting those, which is the `\s`-carries-hidden-members lesson again.

**All five are now closed**: E4 by `definitionWindowTransform`, F4 by one filter in
`commentQuoteExtentTransform`, E5b by one guard in `footnote-bare.ts`, C3 by
`tableLabelRowTransform`, and A2c by `calloutTitleInterruptTransform`.

A2c is the one that could only be settled on the corpus -- it has **no instance** in the
referee corpus at all, so the 8 their document reports is a count of their own examples. Five
probes settled it, and the two controls are what make it a rule about the TITLE rather than
about the marker: `> text` / `> 2. item` keeps `2. item` as text, because a quote's first
line genuinely is a paragraph, and `> [!note] title` / `> 1. item` was already a list because
1 interrupts anything. All three were
found by reading their rules document rather than by measuring our own corpus, which is the
argument for having done it: **none of the three shapes appears in our 3,378 cases at all**,
and all three are real.

E5b is the cheapest of the three and was mis-scoped in both directions before measuring. The
note above predicted it needed "converting a node back to text, which is the raw-slice
hazard" — it did not. Both failing documents come from the one pass in `footnote-bare.ts`
that exists to claim a label containing `[`, so the fix is a guard at the point of creation
and no node is ever built. **Where a defect is "we invent a node", look for the pass that
invents it before reaching for a pass that removes it.** The two differ by exactly the hazard.

### Re-auditing their rules document: it has grown, and every claim in it holds

The first audit of `docs/obsidian-reading-rules.md` ran 33 of its examples and found five gaps,
all since closed. **The document has since roughly doubled** -- a whole new section G, plus D8,
B10, F6, G2, P2, D4's block-id rule and extended E2, all dated 2026-10-08 -- so the audit was
re-run against the current text, 44 examples over every rule with a checkable claim.

**39 agree. Five diverge. All five are OURS, and not one claim in their document is wrong.**
That is worth stating plainly, because the question being asked was whether their docs might be
describing an extension or misreading the app: every example was put to live Obsidian 1.14.4
through `ask.mts`, and Obsidian sided with their document every time.

What agreed on arrival is most of the new material: the whole of G (a line written into the
blank line under a paragraph carries it on, over a rule, a table, code and prose), D4's rule
that a block id counts only at the very END of its block (`text.[^1] ^water1` registers
`water1` and `text. ^water1[^1]` registers none), F6's note ending inside an open fence or
comment, E2's label-line block starts and lead-quote label, D7's bracketed-text references, and
A1's callout-title edge cases including `> [!note|meta]` and `>  [!note]`.

| diverging shape                                          | theirs                   | ours                        |
| -------------------------------------------------------- | ------------------------ | --------------------------- |
| B10 `- apples` / `[^1]: x` / `- pears`                   | ONE list                 | two lists                   |
| C2 `\| a \| b \|` / `\| --- \| --- \|` / ` \| c \| d \|` | table, then a paragraph  | table only, row absorbed    |
| C2 `a \| b` / `--- \| ---` / `    \| c[^2] \| d`         | the row stays a row      | indented `code`, ref dead   |
| D6 `[foo]: /url` / blank / `'tit [^1]` / `le'`           | title holds it, ref dead | our own paragraph, ref live |
| E5 `a[^^[x]]`                                            | reference named `^[x`    | no reference                |

E5 is the known-hard one and consistent with what this file already records: a footnote label
runs to the first `]` with no counting, needs a construct claiming `[^` before anything else
sees that bracket, and three attempts at it are refuted. The other four are new.

**And the corpus cannot see four of the five**, which is why mining their document is worth the
round trip even after a first pass: B10, the pipeless indented row, and the D6 title each have
**zero** cases in 3,403, and the two cases matching the piped-row shape are both inside
containers where the indentation is the container's content column instead. The 47 cases
matching a bracket-in-name pattern are all INLINE footnote shapes, not references. So a clean
delta against this corpus would have said nothing about any of them -- the standing rule about
counting the cases that exercise a rule, met again from the far side.

Two notes on running this audit, both the kind that invalidate a result silently:

- **`footnoteRefs` lists only references whose name HAS a definition.** Comparing every
  `footnoteReference` node in our tree against it reports a divergence for every dangling one,
  which is three of the first four "diffs" this audit produced. The same caveat already applies
  to probes and is recorded above; it applies to their document's examples too, several of
  which define nothing.
- **Obsidian's `sections` carry ZERO-LENGTH `text`/`element` entries past the end of the
  document** for the relocated footnote list. `sourceBacked` in `compute.test.ts` drops them,
  and a hand-rolled comparison has to do the same or every case diverges on `sections`.

Also measured: Obsidian's `blocks` is a RECORD keyed by identifier, not an array like every
sibling field.

### Re-measuring the last two gaps shrank them, and one to nothing

Their rules document gives sizes in its own terms, and those are not sizes in ours. Measured
here against the same 6,818 documents:

| gap | their figure | actionable here | why it moved                                                                       |
| --- | -----------: | --------------: | ---------------------------------------------------------------------------------- |
| C3  |            9 |           **4** | 3 of the 7 shapes we already decline, for unrelated reasons                        |
| A2c |            8 |           **0** | the shape does not occur in the referee corpus; their 8 is from their own examples |

So C3 is four definitions behind manual table-row construction, and A2c cannot be measured
on this oracle at all. Both stay queued, with those numbers attached rather than theirs.
**A size quoted from another project's notes is a size in their metric**, which for A2c means
example coverage and not corpus frequency — the same category error as reading their 99.2%
as an agreement figure comparable to ours.

### `visit` reads a visitor's numeric return as a traversal index

An instrumentation trap, and the most dangerous kind: it corrupts counts in a scratch script
while the tree under test is perfectly fine.

`unist-util-visit` lets a visitor steer the walk by returning an index, and an arrow function
with a concise body returns its expression. `Array.prototype.push` returns the array's new
length. So this double-counts every node:

    visit(tree, "footnoteDefinition", (n) => d.push(n.identifier));    // ["1","1"]
    visit(tree, "footnoteDefinition", (n) => { d.push(n.identifier); }); // ["1"]

Proven side by side on a tree holding exactly one definition, after a full object-identity
dump confirmed no node appears twice. It showed up twice in one session -- once as
`refs=["x y","x y"]` and once as `defs=[1,1]` -- and was dismissed as unreproducible the
first time, which is the part worth not repeating.

No conclusion here rested on it: the referee scripts and every ceiling measurement use their
own recursive walks, and the two probes that hit it were testing emptiness, which doubling
cannot change. But a counting measurement built this way would have been wrong by exactly a
factor the eye cannot see. **Always give a `visit` visitor a block body.**

### Keying a table on one side's answer excludes the evidence against you

The sharpest measurement-design error here yet, because the table it produced looked like a
clean win and was four-to-one against.

With the column-0 pullback landed, the largest remaining `endLine` family is 91 rows where
we absorb exactly one line too many. Classifying that extra line by kind, counting both
columns, gives what reads as an obvious rule:

| kind of the line after Obsidian's end | we absorb | we stop |
| ------------------------------------- | --------: | ------: |
| quote                                 |   **102** |     348 |
| blank                                 |        84 |    3130 |
| list marker                           |        14 |     227 |

102 wrong against 348 already right, and stopping more cannot break a definition that
already stops — so "a definition does not absorb a quote line" reads as 102 gains for zero
losses. Implementing it as a truncation and scoring every end it MOVES says otherwise:

    better 91    worse 395    same 22    untouched 4459

Every one of the 395 was a definition whose end already agreed, sitting PAST a quote line
that Obsidian absorbs too. The table could not show them: it is keyed on the line after
**Obsidian's** end, so by construction it only ever sees lines Obsidian does not absorb.
The `stop` column conflated "right" with "ends even earlier", and the whole mass of
agreements where a quote line is absorbed by both sides was outside the table's domain.

So: **a predicate's table must be keyed on where the rule would FIRE, not on where the
disagreement is.** This is the base-rate lesson in a new shape -- the earlier instances were
about believing a count without its denominator, and this one is about a denominator that
cannot contain the counter-examples at all. The cheap guard is the one used here: implement
the rule as a transformation of our own answers and score better/worse/same against the
oracle, which needs no new oracle data and cannot be keyed wrong.

A definition absorbs quote lines, 395 times. The 91 are something else.

### The definition-column bucket is not line-local either

102 documents now differ **only** in a definition's start column, names and lines all
correct. That is the most precisely-bounded bucket left and the shape that produced the
content-column formula, so it was the obvious next target.

It is not tractable from this oracle. Grouping the rows by the prefix of their definition's
line gives 44 distinct shapes, and the same prefix carries **opposite** deltas:

| prefix | rows | ours | obsidian |
| ------ | ---: | ---: | -------: |
| `····` |   14 |    2 |    **4** |
| `····` |   11 |    4 |    **2** |
| `····` |    3 |    0 |    **4** |

Four spaces of indent, three different answers. So the column is decided by the host
container, which the referee does not store — the structural limit recorded two sections
above, reached from a different direction. The corpus is the instrument for this bucket, and
`probe/def-cap/*` is where it already lives.

## mdast has a content model, and the obvious library does not check it

`mdast-util-assert` was the obvious tool and it validates node **shape** only. Verified
against controls rather than assumed, which is the only reason that is known: it ACCEPTS a
`listItem` at the root, a `tableCell` under root, a `paragraph` nested in a `paragraph`, a
`list` holding a paragraph, and a node whose type is `nonsense`. It rejects a missing `type`,
a non-array `children`, and a literal carrying children -- real but narrow.

So it is kept as a cheap shape gate, at **0 violations across 6,806 trees**, because every
pass here that builds a node by hand could break that. And the containment check had to be
written: CommonMark's two content classes plus this package's own nodes, with an unmodelled
type REPORTED rather than ignored, since a silent pass for a node nobody listed is how such a
table rots.

It found **24 violations, and all 24 were one defect -- now zero**:

| violation                    | count |
| ---------------------------- | ----: |
| `listItem > text`            |     8 |
| `listItem > break`           |     6 |
| `callout > text`             |     4 |
| `blockquote > text`          |     2 |
| `footnoteDefinition > text`  |     2 |
| `footnoteDefinition > break` |     2 |

`mathUnclosedContainerTransform` replaces a flow `math` node with a phrasing `text` node
directly inside a block container that requires flow content. The `text`, and the `break`
beside it, belong in a `paragraph`.

**Three gates now point at the math-demotion area independently** -- this, the overlapping
`listItem` spans from the span checker, and 5 of the 12 non-idempotent cases. None of the
three existed this morning, and none would have found it alone: the span checker sees a
symptom in the list item, idempotence sees the second-run divergence, and only the content
model names the cause.

**Wrapping the demoted text in a paragraph closed all 24, and nothing else**, which is the
useful part of the result. The span checker's count did not fall -- one entry was RENAMED
from `footnoteDefinition > break` to `footnoteDefinition > paragraph`, because the wrap
changed which node reports the violation and not the cause -- and the idempotence list did
not move either. The math node's own span still outlives the container holding it, and that
is the `listItem/listItem` overlap and the five idempotence entries both. One defect with
four symptoms; the content-model one is fixed and three remain.

That is worth stating plainly because the opposite reading was available and wrong: three
gates lighting up together looked like one fix would clear all three, and it cleared the one
whose cause it addressed. The containment ceiling is now an ABSOLUTE assertion rather than a
ceiling -- a node in an illegal position is a defect under any reading, unlike a span that
merely disagrees with Obsidian, so there is no argument for carrying one.

**Three of the four symptoms are now closed, in three separate fixes.** The content model
took the paragraph wrap; the `listItem/listItem` overlap took a clamp and turned out to be
`remark-math`'s, now `UPSTREAM.md` item 5; and the last span row went when the wrapper
stopped inheriting the math node's trailing line ending -- a `math` span runs through the
ending after its block, which is right for a flow node and wrong for the phrasing node
replacing it.

The span ceiling is 134 from 142, and **the five idempotence entries did not move.** So the
"one defect, four symptoms" reading was itself too tidy: three of them shared a cause and the
fourth does not, which only became visible once the three were gone.

One process note from the trailing-ending fix, because it is the clearest instance of a
ceiling earning its keep. The first attempt trimmed the TEXT's end and left the wrapping
paragraph on the math node's original end, so the text inside was correct and its parent was
still wrong -- and the violation count did not move at all. A partial fix measures as no fix,
which is the only reading a count can give, and that is exactly the feedback a boolean
"passes/fails" gate could not have provided.

Two more checks landed with it, both cheap and both closing a hole that was being watched by
hand. **The corpus and the goldens must describe the same documents** -- cases dedupe by
markdown, so a designed probe replaces an incidental fuzz case with the same source, and a
case keeping its id while changing content would move a triage state onto a different
document. That was being checked by hand after every recording, and it is how the C3 no-pipe
control nearly displaced `hunt/label-after-pipeless-table/0` and its note. And **each preset
has to keep what its documentation claims**: a new option added without a preset entry is
silently `legacy`-only, both profiles keep passing, and the published table in the root
README quietly becomes wrong.

## A gate can assert a property the system never claimed

Added as an idempotence gate -- "running the chain twice over one tree changes nothing" --
which read as obviously correct, passed review, and produced a number that looked like a
defect count. It was a category error. **The chain is a pipeline from a fresh parse, not a
fixed-point operator**, and nothing in it claims otherwise: a consumer parses once and runs
once, and no pass is written to see its own output.

Instrumenting one case is what settled it:

    after parse   line=3 col=4 off=23 v=""          micromark's node, at the closing `$$`
    after run 1   line=1 col=10 off=9 v="   Math"   a pass relocated it to the opener
    after run 2   line=1 col=10 off=9 v="Math"

`mathFenceTransform` reads `position.start.line` to index `data.lineOffsets`, so on the first
run it sees micromark's line and on the second the relocated one. Neither `lineOffsets` nor
any offset changed -- both verified identical across all three stages -- so this is not the
stale-point hazard the `.column` audit covers. It is two passes coupled through a position
that one of them moves.

**That coupling is worth a gate; "idempotence" was the wrong name for it.** The coupling is
invisible to every other check here -- both passes are correct on a fresh parse, the parity
gate is green, and the order is undocumented in `src/index.ts` -- and `pass-order.mts` reports
the same coupling from the other direction. So the test stays, relabelled as a fragility map:
a new entry means a newly coupled pair, not a new bug.

Three fixes were made against the old framing before it was questioned, and all three were
real defects found by OTHER gates, so none is wasted. But the 23 were never going to fall to
them, and reading them as a backlog is what sent me looking. **Ask what property a gate
asserts before acting on its count**, and prefer instrumenting one case to reasoning about
twenty-three.

The 23 group as follows, which is still the useful breakdown:

- **Math inside a container, 5 cases.** And `math/list-boundary` is also one of the
  invariant checker's overlapping-`listItem` cases -- the math block outlives the item
  holding it, so on a second run the passes that read the item's extent see a different one.
  **Two independent gates, added an hour apart, pointing at one defect**, which is the whole
  argument for having both rather than picking the better one.
- **A comment straddling a container, 4 cases.** A comment's value is rebuilt from a raw
  source slice, so a second run re-applies the slice to a value that already absorbed it --
  the governing rule met for a fifth time: a raw slice is the right source for a position and
  the wrong one for a value. The round-trip gate found that class through the serialiser,
  which only sees it once output is re-parsed; this sees it directly.
- `commonmark/raw-html/626` is already recorded as refused for growing the author's file on
  every format pass, so its instability is known and deliberate.
- Two singletons, one of which is the only entry appearing under one profile and not both.

Held as a LIST rather than a count, so a fix that trades one case for another cannot hide.

Two smaller checks landed beside it. **Every non-`match` case must carry a reason** -- a
`replicate` with no note is indistinguishable from a case nobody has looked at, and these
notes record that happening once at 106 of 107, found by hand rather than by a gate. And
**no triage state outside the documented seven**, which costs nothing and makes the state
table in this file load-bearing rather than descriptive.

## 24 options, two tested configurations, and a crash nothing was watching for

The parity gate compares two profiles. There are 24 boolean options, so it exercises two
points in a space of 2^24 -- and **a crash is the one failure mode it cannot see**, because
it only ever compares successful parses. A fuzz sweep found 55 crashes in 4,000 documents
once, the first any oracle here had surfaced, and nothing since has watched for them outside
the two configured profiles.

`option-matrix.test.ts` toggles each option one at a time against both presets and parses the
whole corpus: 48 corpus parses, and **no single toggle throws on any of the 3,403 cases**.
That is a guarantee this package did not have an hour ago, and the honest scope is narrow --
a crash needing two options to co-occur is still invisible, since all pairs would be 1,104
parses and belongs in a scheduled job rather than a push gate.

Correctness is deliberately not asserted, because there is no oracle for an arbitrary option
combination: Obsidian has no such configuration. The only honest question left is the
objective one.

**And the first version asserted one thing too many.** It also counted positionless nodes per
configuration, expecting 50 -- a number taken from the referee's output, which measures 6,818
NOTES while this measures 3,403 corpus cases. The real figure is 6, and `points.test.ts`
already gates it BY KIND, which is strictly stronger. A weaker duplicate of an existing gate
is worse than no gate, because it reads as independent confirmation; it was removed rather
than corrected. Two lessons in one assertion -- a measurement in the wrong coordinate system
looks like strong evidence, and the coordinate system here was which corpus.

## The tree's own consistency was never checked, and 142 things are wrong with it

Four gates covered projections, positions against Obsidian, offset-versus-column agreement,
and serialisation convergence. **All four pass on a tree that is internally inconsistent**,
and ~70 repair passes here write spans by hand, which is precisely where that breaks.
`invariants.test.ts` checks the tree against itself: no child reaching past its parent, no
two siblings overlapping, no span running off the end of the source. It found 142 violations
in 8 groups on the first run, from three distinct causes, each a hand-written span:

    [^1]: one / %% / blank / use[^1]                                              92 cases
        footnoteDefinition[0..12]
          paragraph[6..9]          children run to 12; the `%%` fold never extended the host

    > [!note] Title / > [[target]]                                                26 cases
        calloutTitle[10..15]
        paragraph[2..28]           the paragraph kept its pre-split start

    1. Hello $$ / '   Math' / '   $$' / 2.                                         6 cases
        listItem[0..28]
        listItem[26..28]           the math block outlives the item that holds it

**The gate validates itself on a known case.** The remaining large group, 10 of
`root > definition/heading`, is the overlap filed in `UPSTREAM.md` as item 2 and reproducible
on bare `remark-parse` + `remark-gfm`. The checker found it without being told, and that
group must NOT be driven to zero -- doing so would mean diverging from upstream's own output.

**142 is now 36**, in four fixes, and the counts are worth keeping because two of them did not
behave as attributed:

| group                                         | opened |   now |
| --------------------------------------------- | -----: | ----: |
| `paragraph > break` / `text` end late         |     92 | **0** |
| `callout > calloutTitle/paragraph` overlap    |     26 | **0** |
| `root > definition/heading` -- upstream, KEEP |     10 |    10 |
| `list > listItem/listItem` overlap            |      6 | **0** |
| `paragraph > footnoteReference` / `wikilink`  |      6 | **0** |
| `footnoteDefinition > break`                  |      2 | **0** |

**132 of 142 closed in five fixes, and the 10 that remain are upstream's and must stay.** The
gate is now a statement rather than a backlog: every span this package writes covers its
children and sits inside its parent, and the one group left arrives from `remark-parse` and
passes straight through.

The comment-fold fix closed **98** where 92 were attributed: the `footnoteReference` and
`wikilink` groups were the same fold seen through a different child type, so grouping
violations by child type had made one defect look like four families. And the math-demotion
fixes closed three groups that had read as one -- the content model, the sibling overlap and
the trailing line ending each needed their own change.

So the grouping a checker reports by is a presentation choice, and it shapes which defects
look related. Both readings here were wrong in opposite directions, and only fixing them
showed it.

Why it matters beyond tidiness: `obsidian-linter` splices by offset. Two overlapping siblings
give it no edit order, and a child reaching past its parent lets it delete text belonging to
neither. A wrong offset is worse than a missing one -- the rule this repo already applies to
its own passes, and had never applied to its own trees.

Held as a CEILING with every group attributed, for the reason `compute` holds one: the
violations are real and pre-existing, and a gate that is red from the first commit gets
ignored. The second assertion in the file is absolute rather than a ceiling, because a span
running off the end of the source or ending before it starts is never debt: that list is
empty and must stay empty.

## 29 ordering claims, validated as a set for the first time

`src/index.ts` orders ~74 passes and carries 29 ordering claims in comments. Each came from a
real failure, and **a stale claim reads exactly like a live one**, so the set had never been
checked. `pass-order.mts` checks it: rewrite the chain, hash every corpus case's tree under
both profiles, restore the file in a `finally`.

Moving each unit to BOTH extremes of the chain -- the strong test, since a pass that is
byte-identical running first and running last has no constraint the corpus can see -- gives
**20 position-independent of 62**, and 42 position-sensitive. Adjacent swaps, the cheap and
much weaker version, find only 3 of 46 pairs order-dependent. A claim spanning ten passes is
invisible to a swap with a neighbour, which is why the extremes test is the default.

**The first version of this tool reported 18 of 47 and was wrong, in a way worth keeping.**
It recognised only bare `xTransform(...)` calls, so the 27 passes inside `if (opts.x)` guards
were neither moved nor counted -- and, far worse, its "top" insertion point was the first
BARE call, which sits below several option-gated blocks that run before it. Every pass it
moved to "the top" was therefore moved to the middle. Teaching it to move a guard as a unit
with its body flipped `shortComment` and `definitionLazy` from free to sensitive and changed
`tableInterrupt`'s profile. **An audit is only as good as its block set, and an incomplete
one does not fail loudly -- it reports a smaller, confidently wrong answer.** That is the
stale-table lesson from `normalize-points.ts` recurring within a day, in the tool written to
catch that class of thing.

Three findings, and one was mine from the same day:

- **`calloutTitleInterrupt` had a real, undocumented constraint.** It reads `calloutTitle`,
  which does not exist until `calloutTransform` builds it, so at the top of the chain it finds
  nothing and an ordered item below a title stays a paragraph. Now documented with its
  evidence.
- **`tableLabelRow`'s "after the three table passes" is UNEXERCISED.** Running it first is
  byte-identical over the whole corpus, because micromark builds the `table` node before any
  transform runs, so the node it needs always exists. I wrote that claim the same day as the
  pass, from reasoning rather than measurement. It stays in that position -- it is the safe
  one -- with the comment now honest about its evidence.
- **`normalizePoints` last is confirmed**, in both modes. That is the claim the whole
  offset-honesty discipline rests on, and the one that most needed to be true.

Two limits before trusting the output.

### The 42 sensitive units against the 29 claims

Cross-referencing which position-sensitive units carry an ordering comment: **16 do, 26 do
not.** The audit cannot say what each of the 26 depends on, but it does give the DIRECTION
free, which is most of the value:

- `top=DIFF bottom=same` -- the pass needs something built BEFORE it, so it has a lower
  bound and no upper one. `shortComment`, `quoteMerge`, `fenceOutlives`, `mathOutlives`,
  `calloutTitleInterrupt`, `blankFootnoteLabel`, `htmlSetext`, `multilineSetext`,
  `definitionLazy`, `definitionBlankTail`, `blankLabelReference`, `if(keepComments)`,
  `if(positionedBreaks)`.
- `top=same bottom=DIFF` -- the pass must run BEFORE something, so an upper bound and no
  lower one. `lrdFootnote`, `legacyDefinition`, `legacyDefinitionPromote`,
  `quoteIndentedCode`, `indentTab`, `definitionTab`, `tableRowStyle`, `tableLabelRow`,
  `restoreInlinePositions`, `lazySetext`, `setextUnderline`, `footnoteLabel`,
  `if(comments)`, `if(frontmatter)`, `if(customTaskChars)`, `if(math)`,
  `if(labelPrecedence)`.
- `top=DIFF bottom=DIFF` -- pinned on both sides. `if(callouts)`, `containerLazy`,
  `mathMidline`, `invisibleBlankLine`, `bareCheckbox`, `containerSetext`, `tableInterrupt`,
  `definitionTrim`, `normalizePoints`, `if(bareFootnoteRefs)`, `if(taskReparse)`.

**And the cross-reference found a real defect rather than only a gap.** `normalizePoints`
came back undocumented, which is absurd for the pass the whole offset-honesty discipline
rests on -- and it was: the `// Last, so every pass above only has to keep its offsets
honest.` comment had drifted two passes up the file, where it read as a claim about
`linkNbspTitle`. A detector that attributes a comment to the call below it is what surfaced
that, and nothing else would have: both passes are in the right place, so no test could fail.

**"Position-independent" means "on this corpus".** A pass can be genuinely constrained and
come back free because no recorded case exercises the interaction -- the same caveat as the
zero-regression lesson, where a clean delta against a corpus holding no case for the rule told
us nothing and cost a shipped regression. A free result retires a CLAIM, not a constraint, and
the honest follow-up is a probe that would exercise it.

### The offset-over-line rule, audited as a class for the first time

Same methodology as the ordering claims above, applied to a different standing rule: **offsets
are what the passes maintain, and the rest of a point is rebuilt from them by
`normalizePointsTransform`, which runs LAST.** So any pass before it that reads `.line` or
`.column` for a DECISION is reading a stale field. That rule was written down twice, in
`definition-column.ts` and then in `footnote-interrupt.ts`, each time after a defect -- and
never checked against the other ~70 passes.

**Both known instances failed SILENTLY**, which is what makes the class worth auditing rather
than waiting for a third report. A stale read makes a rule DECLINE; the tree stays valid, every
invariant holds, and only an unrelated-looking parity row is wrong. The
`footnote-interrupt.ts` one had been costing four composition rows and was attributed to
"tokenizer-level work" for weeks.

Grepping for line comparisons gives five transform suspects, and the cheap decisive instrument
is to measure STALENESS at each call site rather than reason about it: walk the tree, recompute
each point's line from its own offset, and count the disagreements. Over a 487-case sample:

| pass                             | documents with a stale line at that call site |
| -------------------------------- | --------------------------------------------: |
| `mathUnclosedContainerTransform` |                                        **28** |
| `lrdFootnoteTransform`           |                                             2 |
| `frontmatterUnclosedTransform`   |                                             2 |
| `calloutTransform`               |                                             2 |
| `commentHoistTransform`          |                                         **0** |

The shape is exactly what the chain predicts: `commentHoist` runs first and sees micromark's
own points, `mathUnclosedContainer` runs second-to-last and sees the accumulated damage.

**And converting the worst one is INERT** -- corpus, referee and all 1,152 composition
sequences byte-identical. So staleness being present at a call site does not mean the rule
reads a stale node: the 28 documents have some node out of date, never the callout/math pair
this rule compares. It is kept as latent correctness, labelled inert in place so nobody
re-measures expecting movement, and the other three are left alone on the same evidence.

Two things to carry. **A measurement that finds nothing still retires a question** -- "is the
offset rule violated elsewhere" was open and is now answered with numbers. And **a defect class
that fails silently cannot be found by waiting**, because nothing reports it; it has to be
swept, the same argument that justified the ordering audit and the invariant widening.

## Reducing a referee disagreement needs an invariant, and two obvious ones fail

`referee-shrink.mts` deletes lines from a disagreeing note, re-bases the recorded answer, and
keeps a deletion while the disagreement survives -- so a dense note becomes the shortest
document that still disagrees, which is what the corpus can then adjudicate. Getting the
stopping condition right took three attempts and the two failures are the useful part.

**"Still disagrees" has a degenerate attractor.** A definition's answer carries `lastLine`, so
deleting its body leaves an extent nothing in the shorter document can satisfy; the
disagreement is then preserved by construction and every deletion looks productive. All 150
notes walked down to one line, and the top forms were `[^ch2*]: def`, `[^3]: Text`,
`[^note]: Definition` and a seven-space `[^1]: def` -- every one of which this package already
gets right. Guarding the spans of recorded entries fixes that half.

**And it is still not enough, because the disagreement can CHANGE.** `> %%` over
`[^3]: Text` is a note where Obsidian reports no definition and a reference at the label: the
quoted `%%` runs to the end of the note, the definition fails, and the name is indexed anyway.
Delete the `> %%` and the remainder still disagrees -- now because we report a definition
Obsidian would also report, against a re-based answer describing nothing. The shrink took
that step and printed `[^3]: Text` as a minimal form of a rule about comments.

So the invariant is the **signature**: every answer entry we miss has to stay missed, and no
entry we do not report may appear. A deletion that trades one defect for another is not a
reduction of the first. With that, 121 of the 150 shortest notes reduce to 115 distinct
minimal forms, and they are legible:

    2x  "> %%\n[^3]: Text"
    2x  "%%\n1.  [^ch2*]: def"
    2x  ">%%\n[^ch2*]: Definition"
    2x  "> > %%\n[^note]: Definition"
    2x  "  %%\n-     [^1]: Definition"
    2x  "  10.     %%\n    [^1]: def"
    2x  "- %%\n\n\t[^2]: body text"

**An unclosed `%%` above a label line dominates the list**, which is the
commented-definition-degrades-to-a-reference rule -- refuted four times here at 444/329,
578/237 and 540/273 and recorded as permanently abandoned. Those measurements grouped a
coarse predicate over dense documents; these are two-line forms where one case is one cause,
so it is different data about the same rule rather than a fifth attempt at the same
measurement. The next step for it is a probe wave, not another referee predicate.

Two standing cautions. Re-basing is exact about line numbers and says nothing about whether
Obsidian would read the remaining lines the same way, so **every form it prints is a lead to
record, never a rule to implement** -- the same standard a third-party implementation's tests
get. And the signature invariant makes reduction conservative on purpose: 29 of the 150 did
not reduce at all, which is the honest outcome for a note whose defect needs its whole
context.

## Other implementations are arbiters too, and mining their tests works

Four third-party Obsidian-markdown parsers were checked for test data this package could
use: `Nodsoft/MoltenObsidian` (C#), `paddyd/obsidianmd-parser` and
`danymat/Obsidian-Markdown-Parser` (Python), and `powerman/goldmark-obsidian` (Go).

**`goldmark-obsidian` is the one with directly comparable data.** `testdata/block_id.txt`
holds 28 block-identifier cases in a markdown/HTML golden format with an explicit
"supported"/"not supported" verdict per case. Running all 28 against this package: **19
agree, 9 differ**, in four groups.

One group was **their** error, which is the whole reason the same rule applies here as to the
legacy stack. Their case 300 asserts an identifier inside a block quote is "not supported";
`probe/block-id/in-quote` has recorded `> text ^blk` registering `blk` since long before, and
it matches. So a third-party implementation is an arbiter -- it tells you where to look, not
what the answer is.

**The other three groups were real, and all three are now closed.** Each was probed against
the application first, with controls:

| question                       | Obsidian                   | was ours   |
| ------------------------------ | -------------------------- | ---------- |
| `` `Line.`^blk ``              | registers, renders `Line.` | nothing    |
| `` `Line`.^blk ``              | nothing (control)          | nothing    |
| `Line.^blk`                    | nothing (control)          | nothing    |
| ``## `Title`^blk``             | registers                  | nothing    |
| `    ^blk` (four columns)      | nothing                    | registers  |
| `   ^blk` (three columns)      | registers (control)        | registers  |
| `- Item ^one` / `  - Sub ^two` | **both**                   | inner only |

So an inline code span's **closing backtick** frees the caret where ordinary text does not,
and four columns is indented code holding no identifier. Both landed; the nested pair is
recorded in the `blocks` ceiling with its cause -- the line scan iterates root children and
takes the last candidate, so a list holding two identifiers reports only the last.

Two notes for the next pass at this:

- **The other three repositories had nothing comparable.** MoltenObsidian's tests are vault
  and tag plumbing, and both Python parsers test their own object model against a fixture
  vault rather than markdown against expected output. Worth the ten minutes to check, not
  worth returning to.
- **Check the field exists before believing a comparison.** `goldmark-obsidian` also has a
  20-case task suite, and comparing it reported 3/20 agreement -- because `tasks` is not a
  key of the `compute` projection at all. Tasks live in `listItems` as `" "|parent:...`, and
  we get them right. That is the "a field that does not exist reads as agreement with
  whatever you expected" trap, inverted: here it read as total disagreement.

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

## One consolidated view, and why it needs its own gate

`overview.mts` prints every oracle, axis and scope boundary in one place. It exists because
of a measured failure rather than for presentation: three times in one session a metric was
reported as MISSING when it was already present and already answering the question --
`normalize.ts` had the container-nested-heading rule, `container-setext.ts` had the
render-versus-index asymmetry, and `frontmatter` was already argued as scope rather than
debt. The knowledge existed, spread across thirteen instruments and some thousands of lines
of docstring, and re-deriving it produced wrong answers three times running.

So the load-bearing column is not a number. It is **`blind` -- what each oracle CANNOT see**,
because every one of those mistakes was about coverage and no amount of running the gates
would have corrected them. Each entry also names the FILE that owns its ceiling rather than
restating the value, so there is no second copy of a number to go stale.

### Its own gate caught it being a tautology

`overview.test.ts` asserts coverage: every `*.test.ts` registered, every `PROJECTION_KEYS`
entry and every `COMPUTE_KEYS` entry claimed by some oracle, every named ceiling file
present, and no oracle with an empty `blind` list.

The first version was **worthless and looked fine**. The registry wrote
`compares: [...PROJECTION_KEYS]`, so adding a key to the source list added it to the claim
too -- and an unregistered projection passed. Proved by injecting `pretendNewProjection` into
`COMPUTE_KEYS`: the gate stayed green. Spelling both key lists out by hand makes the registry
an independent claim, and the same injection then fails with
`expected [ 'pretendNewProjection' ] to deeply equal []`.

That is the predicate-standing-in-for-the-premise error, committed inside the gate written to
prevent a related one. **Verify a new gate by breaking what it watches**, and prefer a
hand-maintained claim measured against generated truth over a claim derived from it. The
registry deliberately imports nothing from `types.js`, with a comment saying so, because an
absent import is invisible and adding it back would silently restore the tautology.

A second, smaller trap on the way: the key list started life exported from
`compute.test.ts`, and importing a TEST file registered its suites a second time -- the
overview's seven checks reported as eleven. `COMPUTE_KEYS` now lives in `types.ts` beside
`PROJECTION_KEYS`, which is where a projection key list belongs anyway.

## Working the gated set down, and what each fix cost to find

The first session driven by the gated composition axes rather than by picking a diverging case
and reasoning about it. Five fixes, and the pattern in how they were found matters more than
the count: **every one was a rule already measured somewhere, needing a second node type, a
second host, or one level more depth.** Not one was a new repair for a newly observed shape.

| fix                                                 | rows  |
| --------------------------------------------------- | ----- |
| an indented line after a link definition is code    | 35→33 |
| a blank line bounds an unclosed `$$` a list absorbs | 33→21 |
| …and its chain reaches the list across a footnote   | 21→19 |
| an html lazy line gives up its setext underline     | 19→17 |

Zero corpus regressions throughout, and the referee's agreeing set diffed by id at every step
rather than by its total.

### The gates caught four things reasoning did not

**The corpus refuted my first hypothesis.** The math fix broke
`hunt/fix-lazy-skip-not-revisited/0` on its first run, and the obvious explanation -- that
`$$ tail`, with content after the opener, behaves differently from a bare `$$` -- was wrong:
three further controls bound all of them identically. The real axis is the TAIL's indentation,
because an indented line continues the list ITEM across the blank so the item never closed.
That guard is the entire difference between the rule and a regression.

**An id diff separated an unmasking from a regression.** The referee dropped one document and
it read as a cost. Three controls showed the swallowing formula had been HIDING a separate
defect: `>\t[^Ω]: body text` defines nothing in Obsidian while `>   [^Ω]:` defines. The fix was
right and a second bug became visible -- which is not a reason to revert.

**The compose gate went red on a FIX**, twice, forcing the expectation to move with it. That is
the property an exact set has and a bound does not, and it is why `roundtrip` was converted
away from a bound.

**And probing caught a silent content loss no gate could see.** The first
`definitionIndentedCodeTransform` sliced only the indented run, while `[ref]: /url` /
`    code` / `lazy` arrives as ONE paragraph spanning both lines -- so the splice DELETED
`lazy`. That row was already red for the node type, so no count could have moved.

### Two candidates measured and declined

**The quote-tab rule scores +29**, which would be the second-largest single move recorded here,
and it is NOT shipped. Asked directly, our simple cases are already right -- `>\t[^b]:` defines
nothing here and does define in bare `remark-parse`, `>   [^b]:` defines, and the
three-line established form defines both. So the gain is a CONTEXTUAL defect and a line-based
drop would fit the referee while contradicting five controls. Both variants sit in `score.mts`
with their numbers; `reproducers.json#881` is the shape to chase instead.

**The nested-definition column is confirmed** over three depths -- `> [!note]` gives 0,
`> > [!note]` gives 2, `> > > [!note]` gives 4, so it is the content column of the container
ENCLOSING the callout. It has now been scored both ways, and neither says to build it:

| candidate                      | better | worse | touched | verdict             |
| ------------------------------ | -----: | ----: | ------: | ------------------- |
| any nested container counts    |      0 |     5 |      12 | net negative        |
| only quotes and callouts count |      0 |     0 |   **0** | **NOT ADJUDICABLE** |

The general form is actively WRONG, and its own counter-examples say why: all five nest
through a LIST -- `10.`, `*`, `1.` -- and want column 0, where every measured case nests
through QUOTES. That is the list/quote asymmetry this file records as a class of exactly
four, met again in a candidate rather than in a parser.

Narrowed to the form the probes actually measured, it touches **nothing** in 6,818
documents. So the referee cannot call it safe or unsafe, which is the fourth verdict earning
its place a second time -- reporting that as "net negative" would read as evidence against a
rule the corpus simply has no opinion about.

**Which leaves one `compose.mts --nested` row as the entire evidence for it**, against twelve
recorded probes behind the column-0 behaviour the early return protects. Declined on those
terms, with both numbers at the return and both variants in `score.mts`.

And the first scoping was a bug in the candidate, not a finding -- **the fifth time a new
oracle's first result has been its own defect.** Its precondition was `/^[ \t>]/`, "no
whitespace or quote prefix", which does not exclude a LIST prefix: `2)  > [!NOTE]- [^注1]:`
has its label at column 15 and the rule overwrote it with 2, scoring 0 against 22. All three
printed counter-examples were that mistake. Reading the examples rather than the totals is
what separated them, and `score.mts` printing three `worse` documents exists for exactly
this.

### Widening the invariant gate found four defects nothing had seen

`invariants.test.ts` walked the 3,403 golden cases and nothing else -- a limit on its INPUT,
not on the check. The 1,152 composition sequences had never been held to it, and the first one
examined by hand held a `footnoteDefinition` with start offset 16 and END OFFSET 15. That
file's own first assertion tests for exactly that, and it passed only because the document was
not in the corpus.

`violationsOf` now lives in `invariant-checks.ts` and `compose.test.ts` runs it over every
sequence, which needs no Obsidian because the checks compare the tree against itself. It
opened eleven self-contradicting sequences: the upstream `definition/heading` overlap, which
**must not reach zero**, and four of ours.

**All four of ours are closed, and they were one defect.** A transform that locates a node by
DESCENDING edited it and left the nodes it had descended PAST spanning the old extent. Three
passes, one mistake, found in three shapes:

| violation                                       | pass                         | shape                  |
| ----------------------------------------------- | ---------------------------- | ---------------------- |
| `start AFTER end: footnoteDefinition` 16→15     | `lazySetextTransform`        | end set past own start |
| `start AFTER end: text` 8→7                     | `lazySetextTransform`        | same, one level down   |
| `child ENDS AFTER parent: blockquote > list`    | `lazySetextTransform`        | shrunk inward, gap     |
| `child ENDS AFTER parent: listItem > paragraph` | `footnoteInterruptTransform` | stretched outward, gap |

So the rule, which is worth more than the four fixes: **the descent is the unit of work.** A
helper that recurses to find a node must return the PATH it took, because the caller's edit
invalidates the span of every node on it. `paragraphHostPath` and `lastParagraphOf` both
return their path now, and each docstring points at the other.

Two of them were a NEGATIVE SPAN — a start after its own end — which is categorically broken
rather than untidy: a splice-by-offset consumer such as `obsidian-linter` cannot order an
edit against it. The other two were a child outliving its parent.

**And one of the four was a divergence too.** Dropping the emptied `footnoteDefinition` rather
than clamping it closed `isolate|callout > footnote > thematic`, because Obsidian reports no
definition there — a definition absorbed as a container's lazy content is not a definition to
it. The repair and the parity answer coincided, which is the shape worth looking for: a
consistency fix that also moves an oracle is not a coincidence, it means the inconsistency
WAS the divergence.

An empty "ours" group makes the gate stricter rather than vestigial, because the set is
asserted exactly — a new span defect anywhere in the 1,152 sequences now surfaces as an
unexpected key instead of being absorbed into a tolerated group.

**Attribution is a claim, and this harness has now been wrong about one in both directions.**
`UPSTREAM.md` item 2 asserted we do not reproduce upstream's `definition/heading` overlap; one
line of measurement shows `definition@0-0` followed by `heading@0-2`, and this very gate had
been recording seven of them all along. Conversely the `listItem` defect was checked against
bare `remark-parse` (consistent) and `+ remark-gfm` (also consistent, by a different shape)
before being called ours — our tree is a hybrid of the two. **Measure both upstream configs
before blaming or absolving either side.**

Two gate widenings in one day, with opposite outcomes: `headings` added ZERO divergences across
540 sequences and was still worth running, while this one surfaced four defects. Which it would
be was not knowable in advance, and that is the argument for running both.

### What the remaining rows are

Attributed in `compose.test.ts`'s own docstring rather than here, so the list cannot drift
from the gate that holds it -- and with no counts here either, for the same reason the gate
dropped its own: three separate tallies in that docstring went stale while `DIVERGING`
directly below them moved correctly.

The shape of what is left, in three groups:

- **`> comment`** needs `%%` to interrupt lazy continuation. `- item` / `[^1]: def` / `%%`
  arrives as ONE paragraph with the `%%` as a text child, so there is nothing to lift --
  tokenizer-level, not a guard.
- **`footnote > indented`** and **`quote > callout > footnote`** turn on a lazily-absorbed
  definition not being a definition to Obsidian, and on the definition column of the
  container enclosing a nested callout. Both are recorded with their rules at the code that
  would have to change; the first touches an absorption path carrying 43 referee documents.
- **The `comment [ ... ]` rows are the P1 cache defect and MUST NOT be fixed**, so the floor
  here is not zero. Obsidian's offsets are short by the width of the `%%` marker, and
  reproducing them would write a wrong offset into our own tree.

## Files

| File                     | Role                                               |
| ------------------------ | -------------------------------------------------- |
| `corpus.ts`              | Deterministic case generator                       |
| `chain.ts`               | Pinned Quartz pipeline and feature profiles        |
| `normalize.ts`           | Our projections, from mdast                        |
| `types.ts`               | Shared projection and golden shapes                |
| `compare.ts`             | Diffing and gate policy                            |
| `oracle.e2e.ts`          | Recorder; runs inside Obsidian                     |
| `parity.test.ts`         | The gate; no Obsidian required                     |
| `goldens/obsidian.json`  | Recorded output, version-stamped and triaged       |
| `overview.mts`           | One view of every oracle, axis and scope boundary  |
| `overview.ts`            | That registry, gated against drift by its own test |
| `ask.mts`                | Asks a running Obsidian about arbitrary markdown   |
| `score.mts`              | Scores a candidate rule over the whole referee     |
| `compose.mts`            | Sweeps construct sequences vs Obsidian; `--record` |
| `compose.ts`             | Those axes as a library, so a test can import them |
| `compose.test.ts`        | Gates every axis, and the tree's own invariants    |
| `goldens/compose.json`   | Obsidian's answers for all 1152 sequences          |
| `invariant-checks.ts`    | The tree's structural invariants, shared           |
| `ask-dom.ts`             | The DOM projections the cache does not carry       |
| `probe-agrees.mts`       | Does the probe agree with the goldens? 663 of 663  |
| `proxy-agrees.mts`       | Detached render vs a REAL Reading View             |
| `delta.mts`              | What a change gained and broke, before committing  |
| `invariants.test.ts`     | Structural invariants on the tree itself           |
| `option-matrix.test.ts`  | Every option toggled, looking for crashes          |
| `hygiene.test.ts`        | Chain idempotence, and triage notes                |
| `fuzz/contradictions.ts` | Shapes holding both a match and a divergence       |
| `referee.mts`            | Measurement against the sibling project's oracle   |
| `referee-shrink.mts`     | Reduces referee disagreements to minimal forms     |
| `pass-order.mts`         | Which passes depend on their position in the chain |
| `UPSTREAM.md`            | Defects found in upstream packages and Obsidian    |

The DOM probe is a plugin, not a harness file: `test-vault/.obsidian/plugins/parity-probe`
exposes a detached `MarkdownRenderer` and a real Reading View, because `obsidian eval` has
`require` but no `obsidian` module -- it is injected into plugins at load time. The real view
additionally needs CDP focus emulation, since reading mode renders off
`requestAnimationFrame` and Chromium starves an unfocused window:

```bash
obsidian dev:cdp method=Emulation.setFocusEmulationEnabled params='{"enabled":true}'
```
