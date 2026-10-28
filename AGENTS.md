# AGENTS.md

Operational brief for `@quartz-community/remark-obsidian`. Everything here is a fact that cost
measurement to establish, or a trap that has already wasted a session. Prose belongs elsewhere.

## What this package is

A remark plugin that makes a remark pipeline parse Markdown the way **Obsidian** does.
Correctness is measured, not asserted: a harness renders a generated corpus inside real Obsidian
and compares against our output, and a referee corpus of **6,844 documents** holds Obsidian's own
`metadataCache` answers.

Obsidian internally runs a fork of **`remark-parse@8`** (rp8) — the pre-micromark architecture, a
line-oriented tokenizer loop with an explicit `interruptors` list. **Since 2.0 `legacy` parses
with rp8 itself**; `strict` parses with micromark.

The 1.x effort corrected micromark towards rp8 with ~100 passes and recorded every measurement
of it here, about 2,500 lines. That record went with the code it described. It lives in git
history under the `archive/main-pre-2.0` tag, and the 2.0 development commits cited below live
under `archive/rp8-legacy-prototype`. Read the old record before re-attempting anything on
`strict`'s micromark path that sounds familiar; most of it has a refusal with numbers.

## 2.0: `legacy` IS remark-parse 8

The micromark-era conclusion "the remaining gap is architectural" was right, and the architecture
changed. Upstream `obsidian-footnotes`' reader -- rp8 plus ~10 short Obsidian readers registered
through rp8's own tokenizer tables and interrupt lists -- asserts agreement with every answer file
vendored here except the four P1/P2 documents. Ported, and finished, it measures:

|                                      | micromark (pre-2.0) |         2.0 |
| ------------------------------------ | ------------------: | ----------: |
| referee                              |               6,307 |   **6,830** |
| contract gate, `match` cases         |       3,447 / 3,447 | 3,469/3,469 |
| positioned oracle divergences        |                  20 |       **8** |
| RAW positions vs `compute`: sections |               97.4% |    **100%** |
| RAW positions: headings / list items |        94.2 / 82.2% | 100 / 92.4% |

1.1.0, the last release before 2.0, agrees with the referee on **984** (stock `remark-parse` +
`remark-gfm`: 983) — scored through the referee's own test, artifact exclusion included.

The RAW row is the one to remember: `normalize.ts` compensates for micromark's offsets in several
places (heading and paragraph starts, empty item ends), so the positioned oracle UNDERSTATED how
far the micromark tree's own positions were from Obsidian's. rp8's are Obsidian's.

Of the 14 referee documents left:

- **10 are Obsidian cache misplacements, where our position is the character's**, so they must
  not be fixed:
  - the 4 P1/P2 documents already recorded;
  - 5 more P2 (`broad#124`, `#147`, `#189`, `#290`, `#299`);
  - one P1-like frontmatter tail (`overnight#132`).
- **4 carry references only the CORRECTED answers have** (inside code / an unclosed fence).

There were 16. The other 2 held references on lines with no text; `referee-spans.json` names
those 3 references as recording artifacts and the referee now excludes them (6,828 → 6,830).

**The referee compares full spans now, and every one agrees.** `record-referee-spans.mts`
re-asked the live cache (1.15.0) for all 6,844 documents, which takes about 15 seconds, and
kept what the vendored tuples drop: start offset, end line, end column and end offset. It keeps
them in `referee-spans.json` BESIDE the vendored files, which stay upstream's and untouched.

- **The recording reproduced the vendored answers exactly:** 5,278 of 5,278 definitions and
  18,704 of 18,709 references by name, line, column and end line.
  - 3 references are the artifacts above.
  - 2 are `fuzz#1239`, whose vendored answer is upstream's corrected list, left unplaced.
- **Over the 6,830 agreeing documents:** 5,258 definition spans and 18,628 reference spans
  agree, all of them. A known-positive control (every reference's end offset shifted by one)
  flags all 18,628.
- **Inline footnotes, a new dimension:** 869 of 869 documents agree, 971 of 971 `[inline<n>`
  spans. They opened at 807. Both causes were the projection, `computeOurs`, not the parser:
  - It skipped a `%%` comment's subtree, so an inline footnote inside one was never reported
    (48 cases). The cache indexes them, as it indexes references there.
  - It numbered an inline footnote by every reference before it, where the cache numbers each
    footnote once, at its first reference. Settled live with a control: `a[^1] b[^1] ^[x]`
    names `[inline1` and `a[^1] b[^2] ^[x]` `[inline2`.
- **Gate:** `referee-spans.test.ts` holds the file to the vendored rows, so a re-sync without a
  re-recording fails there.
- **The recorder:** `ask()` became `askFull()`, which keeps every position, plus the reduction
  to tuples; `ask()` is byte-identical over all 6,844 documents.
- **The text projection** also stopped hiding what follows a quote ending in an unclosed
  comment (moving four `probe/quote-comment-deep` cases to `match`).

**The six "column" documents were mislabelled, and all six are the cache, not us.** They had
been recorded as "BOM, two RTL names, a frontmatter closer, two off by one to three". None
holds a BOM, and the names are irrelevant.

Five put a footnote on the first line under a callout title, where the callout is nested in a
list item. Probed live (1.15.0), with controls:

| document                                                        | Obsidian      |
| --------------------------------------------------------------- | ------------- |
| `> [!note] T` / `> ab[^1]` -- not nested                        | true column 4 |
| `10.  > quote` / `> ab[^1]` -- nested, no callout               | true column 4 |
| `10.  > [!warning]- T` / `> x` / `> ab[^1]` -- second body line | true column 4 |
| `+  >`, `*····>`, `2)⇥>` callouts                               | +1            |
| `10.  >` callout                                                | +3            |
| `- [ ]····>` callout over a `⇥>` line                           | +3            |

The cache's OFFSET moves with its column. `10.  > [!warning]- T` / `> ab[^1]` reports offset 28,
which is the `]` of `[^1]`: the position points at the wrong character, so a consumer editing
by it would edit the wrong text. That is P2, "reports `[^1]` at column 9 instead of 6", with a
shift that is not simply the container's width.

The sixth is `---` / `a: 1` / `---- [ ] [^2]: two`. Obsidian puts the definition at column 6,
which is the space inside `[ ]`; the label starts at 9. A plain reference in a closer's tail
(`--- x[^2]`) is placed right, so it is the task item inside the tail that the cache measures
without the `---`.

So legacy is at every agreement the oracle can grant: it agrees on all 6,830 documents whose
answer is neither a cache defect (10) nor one only the corrected answers hold (4).
Reproducing the defects would cost a true position each, and the shift has no derivable rule.

**Markdown inside HTML is CommonMark in Obsidian too**, so both presets read it the same way.
Obsidian's developers give performance as the reason for its HTML handling, which makes it
`legacy` territory by the intends/delivers rule; it happens to coincide with CommonMark. The 14
`probe/html-markdown/*` seed cases pin it: inline vs block tags, blank lines inside and around
the block, a quote, a list item, `markdown="1"`. Reading View agreed with the detached capture
on all 14. The one case that diverged was the projection: the recorder counts every DOM `<mark>`,
`<strong>` and `<em>`, raw HTML included, so `normalize.ts` now projects a raw inline element
from the sibling run between its tags.

**Where it lives.** `src/rp8/reader.ts` (Obsidian's readers, ported with attribution, plus
highlights, tags, positioned soft breaks, and the speed-ups), `src/rp8/adapt.ts` (rp8's tree to
this package's node types), `src/rp8/list.ts` (rp8's list reader with the two B3/B8 changes),
`src/rp8/vendor/` (rp8, remark-footnotes 2, remark-math 3, parse-entities 2 -- see its README for
every change made after conversion). `remarkObsidian` installs the reader as `this.parser` under
`legacy`, so it must be `.use()`d after `remark-parse`. The 14 `legacy*` options and
`taskReparse` are GONE, along with the 41 modules only they reached: micromark's legacy
constructs and the passes that emulated rp8. No release ever carried them, which was checked
against every published tarball, so nothing was deprecated. `strict` turned all of them off, so
the deletion is byte-identical. 4,147 documents under `strict`, `strict` with each option
flipped, and `legacy` gave 70,499 tree-and-stringify fingerprints, and none moved. Standing
down `calloutTransform` moves 119 documents per configuration, which is the known-positive
control. Where an archived commit names one of those passes, it is history.

**`strict` runs 17 passes, not 76.** Each call site was stood down alone over the 676 spec
examples and the corpus, under `strict` and under `strict` + `bareFootnoteRefs`. None was needed
for a spec example. Three worked AGAINST the spec: `definitionColumn` (`link-reference-definitions/193`),
and `shortComment` with `commentRegion` (`raw-html/626`, which closed with them, emptying
strict's LEAK list). A kept pass does one of four things:

- implements documented syntax: callouts and their title line, any-character task boxes,
  `$$` display math as LaTeX delimits it, a comment ending at its closer;
- repairs an extension where CommonMark and Obsidian agree: frontmatter, remark-math's item
  extents, micromark's split indented code;
- keeps positions;
- carries out an option the caller turned on (`bareFootnoteRefs`, `positionedBreaks`,
  `parseComments`).

The other 59 imitated what Obsidian's parser delivers, and went with 57 modules and `score.mts`.
That instrument scored candidate micromark passes against the referee. The new chain equals the
old one with those 59 stood down on 66,352 document-and-configuration pairs; leaving one
(`definitionLazy`) on moves 219, which is the control. `legacy` is byte-identical. An
audit of the removed passes' own examples found four of them DELETING user text under `strict`, and two breaking its own options: one emitted undefined
`footnoteReference`s and one emitted `break`s.

**How to decide a case (user, 2026-10-27).** Where the docs are silent, `legacy` follows
Obsidian's behaviour and `strict` follows CommonMark/GFM. The exception is behaviour of an
Obsidian EXTENSION that disagrees with them, where `strict` follows Obsidian too. Where the docs
and the behaviour disagree, the behaviour wins: the docs go stale. So a CommonMark/GFM construct
(lists, quotes, tables, link definitions, tabs) is the spec's under `strict`, and Obsidian syntax
is Obsidian's even inside one.

**Footnotes under `strict` read as Obsidian reads them.** They are in neither spec: GFM froze in
2019, before GitHub shipped them. Obsidian's syntax table lists them, but it lists GFM's
strikethrough and task lists too, so it cannot decide what counts as Obsidian's own. 48 live
probes measured how close Obsidian is to `remark-gfm`: 34 identical, and every difference came
from remark-footnotes 2. Three rule differences followed, plus one that GFM causes:

1. a label directly under a paragraph is that paragraph's text;
2. a `2.` line continues a definition, while a table, a link definition or a flush setext
   underline ends it;
3. a label may hold `[`, and a backslash escapes nothing in it;
4. a `[^` label that is not a footnote's is text, never a CommonMark link definition (GFM makes
   one).

Two of Obsidian's behaviours are deliberately NOT followed: the 1,024-character ender window
(an implementation limit) and column 0 for an indented root definition (a position).

The label rules (3) live in a vendored `micromark-extension-gfm-footnote`
(`src/lib/syntax/footnote.ts`), whose constructs are renamed and replace upstream's through
`disable`. The rest cannot go in the construct: micromark does not tell a container start
whether it interrupts a paragraph on a LAZY line. So `obsidianReadingTransform` re-parses an
EDITED copy with the same line structure, using two edits:

- swap one character (the label's `:`, the marker's `.`/`)`) for a private-use placeholder,
  restored in every value afterwards;
- insert a blank line (with a `>` prefix when quoted), mapping positions back.

That leaves every other construct to micromark. A callout title is exempt from rule 1 when the
callout's body, read with the label after it, leaves the label a definition. The title is still
a paragraph at that point, since callouts are built later.

Measured: `goldens/strict-footnotes.json` pins the 107 probes Obsidian answered, and
`strict-footnotes.test.ts` asserts 103 agree and the 4 recorded exclusions still differ (the
fifth closed when `definitionEndBeforeLabel` came back). The
known-positive control: with the rules off, 44 fail. On the referee corpus `strict`'s definitions
agree in 3,936 → **4,967** documents (+1,074 / −43). All 43 losses are constructs `strict` reads
by the spec on purpose:

- 9 tables GFM forms, plus 7 where such a table then ends a definition;
- 6 with a tab after `>`;
- 6 list or setext differences;
- 1 link label;
- 14 `%%` cases. Obsidian's reader treats an indented `%%` line (`> x` / `    %%`) as a comment
  opener that ends the paragraph; the comment EXTENSION does not. The restored comment passes do
  not reach it; the syntax audit below took it up.

Traps this cost:

- **The Write tool turned `\uE000` escapes into literal private-use characters**, invisible in
  the file. Re-escape them with a script.
- **mdast's `definition.label` is DECODED** (`[^a\]b]` reports `^a]b`), so locate a label's
  `]` in the source, not by its length.
- **A container that a blank line continues ENDS on the inserted line**, which must map to the
  end of the line above, not the start of the one below.

**The removed passes, re-measured under the extension rule.** The 76 → 17 cut followed
CommonMark/GFM everywhere; the extension rule says Obsidian syntax follows Obsidian even inside a
container. So the 22 removed passes that touch Obsidian syntax were restored in an EXPERIMENT
worktree and switched on one at a time, then in cumulative sets. They were scored against four
measures: the 676 spec examples, the 3,471 recorded Reading-view cases (`compareCase` with the
profiles switched to `strict`), and the referee's definitions and references.

13 came back, measured together against the 17-pass chain:

- spec examples: unchanged;
- Reading-view cases: 2,902 → **2,928** (+25, plus 1 from the highlight fix below);
- referee definitions: 4,967 → **5,208** (+247 / −6);
- referee references: 1,465 → **1,483** (+20 / −2).

They are: `commentHoist`, `commentDefinitionExtent`, `commentInDefinition`, `quoteCommentLazy`,
`itemCommentLazy`, `definitionLazySplit`, `definitionLazy`, `doubledFootnoteOpener`,
`definitionNestedLabel`, `definitionMathAbsorb`, `definitionEndBeforeLabel`, `tagAfterCloser`
(since widened into `tagAgainstText`, below) and `inlineFootnoteInert`. The 8 losses:

- 4 definition END lines, in `%%`/definition shapes (`fuzz#174`, `#1199`) and around a callout
  inside a definition (`broad#241`, `probes#605`) -- the tail the 1.x record already carries;
- 2 more, a `$$` under a definition behind a TAB-separated list marker (`fuzz#247`, `#909`);
- 2 references, a label inside a `%%` inside a definition (`pins#115`, `#116`).

Three of them changed on the way back:

- **`definitionMathAbsorb` only takes a `$$` directly under the definition.** All 22 gains had
  no blank line between them; 5 of its 7 losses did. That condition took it from +22 / −7 to
  +22 / −2.
- **`doubledFootnoteOpener` makes a reference only to a DEFINED label** unless
  `bareFootnoteRefs` is on. Otherwise it leaves the text literal, as GFM does.
- **`commentInDefinition` builds a soft line ending as TEXT**, not a `break`. It had made every
  folded line a hard break under `strict`.

Refused, with numbers:

- **`commentRegion`**: its `<!--` half breaks `raw-html/626`. Its `%%` half alone is a coin flip
  on definitions, +11 / −10, on top of the rest.
- **`mathListExtent`**: +2 / −3.
- **`quotedTabCode`**: references −1.
- **Inert under `strict`:** `definitionAbsorbedItem` (even after `definitionLazy`),
  `commentQuoteExtent`, `commentDefinitionColumn`, `mathOutlives`, `refBeforeLabel` and
  `quoteDefinitionAbsorb`.

`definitionWindowTransform` (the 1,024-character window) and `definitionAbsorbedItemTransform`
were deleted from `definition-continuation.ts`, which had kept them as unused exports.

**A highlight crossing emphasis goes to whichever opened first** -- Reading view's rule, recorded
on 1.14.5 and asked of 1.15.0. Live Preview styles both, which the user saw first; no tree can
hold two crossing spans. micromark pairs emphasis only after the highlight construct has taken its
span, so `highlight.ts` now simulates CommonMark's pairing on the runs micromark has already
flagged. If a closer inside the body reaches an opener from before the `==`, the highlight
declines. Against the 370 recorded `==` cases `strict` now matches 362, and GFM's strikethrough
rules applied to `==` would match none that it misses.

**The syntax audit: probe each Obsidian rule area live, then gate it.** Grouping the corpus's
537 `strict` mismatches by family mostly yields CommonMark constructs `strict` reads by the spec on
purpose (`fuzz/highlight`'s 64 are setext under list items), so the corpus cannot separate the
extension cases. Instead, each rule area of the upstream rules document is probed against the
live app, and the facts are compared through `computeOurs` on lines. That is
`goldens/strict-syntax.json` plus `strict-syntax.test.ts`, 282 probes over every rule area. Two
traps cost runs:

- Obsidian's `sections` carry `element`/`text` entries for the rendered footnote list, which no
  tree holds, so `legacy` "missed" every probe until they were dropped.
- `ask.mts` must run without `npx`.

- **Comments (their F1-F6):**
  - **F4:** an opener on a LAZY line of a quote or list item ends the container. micromark either
    absorbed it into the paragraph or opened a comment inside the container.
  - **F2:** the closer's tail takes lazy lines.
  - **Whitespace:** the shape decides, not the width. Spaces alone or a leading tab make an opener
    (`\t%%` and `····%%` end a quote as root code), while one to three spaces and then a tab make
    no opener (`>·x` / `·\t%%` / `[^1]: def` is one quote that defines nothing).
  - 37 + 15 probes, all agreeing; referee definitions +18 / −0.
- **Callouts (A1-A5):**
  - **A2:** the title line stands alone. A blank quote line goes in after it, spelled with the
    NEXT line's prefix (`\t> >` and `·····> >` can name the same containers at different
    widths), unless that line is lazy.
  - **A4:** text after the marker was already re-read as blocks, but the definitions those re-reads
    build were invisible to references micromark had resolved earlier. So under `strict`
    `bareFootnoteRefTransform` runs in a defined-labels-only mode.
  - 41 probes, all agreeing; referee references +14, definitions +2 / −1 (tab arithmetic).
- **Wikilinks and embeds (D1, D7), block ids (D4), inline footnotes (E3), math (M1-M2):** 26, 11,
  10 and 13 probes, all agreeing on arrival.
- **Frontmatter (D2):**
  - A closing fence with a TAIL closes it, and the tail is Markdown (`---[^2]: two` defines).
    `frontmatterTail` was cut in the 76 → 17 cut and never re-measured with the passes above;
    frontmatter is Obsidian's syntax, so it is back.
  - All three frontmatter repairs re-parse everything below the fence, so they now run straight
    after the reading pass and re-parse THROUGH it. They used to run after the `%%` passes, whose
    work below the fence they then dropped.
  - 13 probes; one excluded, where ` ---` below `a: 1` is a setext underline under CommonMark.
- **Tags:**
  - A tag starts at a line's start, after whitespace, or where a construct has just ended, and
    a bracket pair counts as one whether or not anything defines it (`[x]#t`, `[ ]#t`, `[#t]`).
    It does not start against literal text: after a second `#` (`##tag`, `#a##b` -- `legacy`
    too), an unpaired `*`, `_` or `~`, an entity, or a `]` no pair closes (`x]#t`, `[x]]#t`).
    `tagAfterCloser` became `tagAgainstText`, and spec example `raw-html/619` now agrees with
    stock (by-design divergences 9 → 8).
  - The tokenizer cannot see which `*` pairs or which `]` closes a label, so it allows the `#`
    after any construct or `]` and the tree decides. A bracket inside another construct is that
    construct's, so the bracket scan stops at any sibling but text and emphasis-like wrappers.
  - 89 probes; one excluded: an UNDEFINED `[^…` is text under `strict`, so a wikilink inside it
    forms where Obsidian reads the reference first.
- **Task boxes (footnote rule 4, found while probing frontmatter):**
  - A footnote label after a task box is a definition inside the item, for any box character
    and a space or tab after it. GFM finds the box inside the item's first paragraph, which
    leaves the label as text. A third edit, `unbox`, removes the box before the re-parse and
    restores `checked` afterwards.
  - 27 probes; two excluded, `>⇥- [ ] [^2]: two`, where Obsidian defines nothing (tab
    arithmetic).
  - **Trap:** an edit read off the SOURCE is found again in every round. Filtering it out by
    `seen` only AFTER choosing "applied alone" left the round empty, so the loop stopped before
    rule 1 ever ran -- `broad#272` defined a label inside `%%` until the filter moved first.
- Against `c197860`: spec divergences 9 → **8**; Reading-view cases 2,928 → **2,935** (+7 / −0);
  referee definitions 5,227 → **5,261** (+35 / −1: 22 task box, 13 frontmatter); references
  1,497 → **1,500** (+3 / −0). The one loss is `broad#327`, the `>⇥` exclusion above.

**The strict triage: every recorded case `strict` misses, classified.** Under the strict preset
536 of the 3,471 recorded cases missed. Three features sorted most of them: whether strict's tree
equals stock `remark-parse` + `remark-gfm`'s with positions ignored (positions differ because
`remark-breaks` leaves stock's inline nodes unplaced), whether it holds an Obsidian node, and
which projection keys diverge. A case whose tree is stock's and whose divergence touches no
Obsidian syntax is the spec read by the spec. The rest were read one by one.

Fixed, each settled against the live app first:

- **An unclosed `%%` or bare `$$` in a quote or list item keeps the lazy lines below it** (rule
  7 in `obsidian-reading.ts`). A fourth edit, `prefix`, gives each such line its container's
  prefix. It stops at a blank line or a line that interrupts: a heading, a setext pair, indented
  or fenced code, a thematic break, HTML, a bullet or `1.` item, another `%%` or `$$`. Labels,
  `2.` items and table rows stay -- 33 + 24 probes.
- **An unclosed `$$y` inside a quote, list item or task is text**, at root it is math; a callout
  title's `$$` is title text.
- **A `%%` line directly under a definition's text is more of that text (D5), at any indent.**
  micromark opened a comment there whose closing `%%` then buried every block below.
- **`[[` straight after a bracket pair is no wikilink** (`a [x][[w]] b`), except after a
  footnote label, the second half of `[x][]`, or a pair holding another bracket.
  `brackets.ts` now holds the bracket scanning `tagAgainstText` used alone.
- **An inline footnote continues over a lazy line**, a **`%%` closer's tail is read as blocks
  inside a quote or list item too**, and **`---⇥` opens no frontmatter**.
- **The text projection stopped hiding what follows a quote that ends in an unclosed comment.**
  It was built for a micromark-era tree. Removing it moved four `probe/quote-comment-deep`
  cases from `replicate` to `match` in LEGACY too (contract 3,465 → 3,469), changing no other
  case.

The reading pass now applies its edits in four tiers, one tier per round. In order:

1. Splits and unboxes.
2. Rules 1-3.
3. Rule 7's prefixes.
4. D5.

Each was forced by a measured loss:

- A prefix applied beside rule 2 pulled a label into a definition when the `10.` list it was
  read off dissolved the same round.
- D5 applied beside rule 1 kept a definition rule 1 was about to dissolve.
- D5 beside a prefix kept one the prefix had just taken into a comment.

Edits are filtered by `seen` before a tier is chosen, since a prefix, like an unbox, is read
off the source.

Against `5dc63bb`, strict:

- spec examples: unchanged at 8;
- recorded cases: 2,935 → **2,962** (+27 / −0);
- referee definitions: 5,261 → **5,328** (+71 / −4);
- referee references: 1,500 → **1,513** (+13 / −0).

Of the four lost: three are tab-spelled quotes (`>⇥>⇥$$`, `>⇥[^ä]:`), where Obsidian's tab
arithmetic makes no block. The fourth is CommonMark continuing a definition's paragraph over an
indented line, once its `%%` is prose. All four agreed before only because strict swallowed the
rest of the note.

**The 509 left:**

| count | why                                                      |
| ----: | -------------------------------------------------------- |
|   475 | CommonMark/GFM structure read by the spec (see below)    |
|    27 | tab arithmetic, which is legacy's                        |
|     1 | micromark itself (`2.` interrupting a quote's paragraph) |
|     1 | Obsidian rendering one math span six times               |
|     5 | deferred, each a decision or a deep change               |

The 475 cover:

- setext and thematic breaks (159);
- trees identical to stock (272);
- lazy lines after a closed fence, a closed comment or a callout title;
- GFM tables (pipeless rows, interrupting a paragraph, cell counts);
- link reference definitions;
- empty list items;
- GFM autolink extent and strikethrough escapes;
- bracket precedence where following Obsidian would undo a CommonMark link;
- emphasis in callout titles.

The five deferred, then decided with the user. Three were Obsidian rules worth following, each
settled live with its boundary first:

- **`[^x](u)` is a link** wherever an inline link forms -- an angle-bracket destination, a
  title, an empty `()` -- defined label or not (rule 8 of the reading pass). `[^1](x`,
  `[^1](a b)` and `[^1] (u)` stay references.
- **`[^x]` straight after a bracket pair is no reference** (`footnoteAfterLabelTransform`):
  `[text][^9]`, `![x][^9]`, `[][^9]` and `[a [b] c][^9]` hold none. Link text may hold
  balanced brackets, which is where it differs from the wikilink rule. It still forms after
  a footnote label, after the second half of `[x][]` or `[x][y]`, and after a link. With
  `[x]: /u` defined, CommonMark still makes `[x]` a link where Obsidian does not; that half is
  the spec's.
- **A label line holding a `|` under a pipeless table is a row** (rule 9), in a quote or list
  item too. Under a table with leading pipes it defines, as GFM has it.

Together: recorded cases 2,962 → **2,965** (+3 / −0), referee definitions 5,328 → **5,333**
(+5 / −0), references 1,513 → **1,520** (+7 / −0), spec unchanged; `strict-syntax.test.ts` holds
406 probes (control: 16 fail without the change). `reference-in-link/shortcut` also needed the
text projection's `dropLabelOpeners` narrowed to labels that are malformed or unclosed. A
remark-parse 8 tree never holds a well-formed `[a][b]` as text, so legacy is untouched (3,469
either way).

Left as they are, by decision:

- an unbalanced `[[[a]]` inside a link label, which breaks the link's bracket count in
  micromark;
- a `$$` line interrupting a lazily continued definition in a list item.

**Two of legacy's nine positioned divergences, re-read under rp8, were not output gaps:**

- **Block ids per list item.** `- Item ^one` / `  - Sub ^two` lost `one` in the projection,
  which read a list as one run and kept only its last identifier, while the package rendered
  both right. Asked of 1.15.0 on ten list shapes: an item registers the identifier ending its
  first paragraph, from its marker to the end of its own content. Projected per item:
  `blocks` 3 → 2, all ten reproduced.
- **An empty item, then an indented one** (`-` / blank / `  -`). Obsidian RENDERS the second
  nested inside the first, as we do; only its cache calls it a separate root list. A cache
  defect, left.

That leaves 8: 2 P1, a garbled embed in an unclosed `%%`, two phantom block ids past the text,
one embed ordering, and those two.

**`strict` is in the pathological suite now, and two quadratics are gone.** The suite ran only
the default preset. Every shape now runs under both presets, except that strict skips
`backtick-increasing`: stock micromark takes 130 s on it at 2,000.

- **A run of `]`.** The vendored footnote reader's `tokenizePotentialGfmFootnoteCall` walked
  back over every earlier event on each `]`, looking for the `![` of a possible `![^x]`.
  Upstream's loop is the same. A label holds at most 999 characters, so the walk now stops
  that far back. 32,000 `x]` went from 23.6 s to 344 ms (stock: 22.7 s), and
  `bracket-close-run` gates it; with the old walk it takes 49 s.
- **`pointAt`.** It counted line endings from offset 0 on every call; it now binary-searches a
  line table kept per source.

Proof for both: 0 of 66,618 tree and raw-parse fingerprints changed (strict, strict with the
Quartz profile, legacy; corpus, spec, referee and generated `![^x]` shapes from 1 to 1,500
characters). Each fingerprint check needed its own known-positive control, and two kinds of
check proved blind:

- **The final tree hides the footnote walk.** A 10-character bound changed no final tree,
  because the defined-label reference pass restores the call. Only the raw parse saw it (40
  changed).
- **The final tree also hides `pointAt`.** A column off by one changed no tree at all, because
  `normalizePointsTransform` rebuilds every line and column from offsets. It was checked by a
  direct differential instead: 200,472 (source, offset) pairs, alternating sources to exercise
  the cache.

**Its gates**, beyond the suite above:

- `test/rp8-vendored.test.ts` -- vendored == published rp8, byte-identical trees on every corpus
  document; the linear tag matcher == the published regexes at every `<` and on 300,000 shapes.
- `test/rp8-speedups.test.ts` -- with == without the speed-ups, every corpus document, every
  Obsidian reader on and off, 60,000 generated documents.

Both have known-positive controls. Re-run them after ANY change under `src/rp8`.

**Traps this cost, each once:**

- **Published rp8 has an EXPONENTIAL ReDoS** in `util/html.js` (`recheck`'s 205-character string:
  134 s in one `.test`) and quadratic expressions in `trim@0.0.1` and `trim-trailing-lines`.
  Obsidian presumably inherits them. The lint only sees regex LITERALS: rp8 builds its tag
  expressions with `new RegExp(string)`, so they were invisible to it until fed to `recheck`.
- **`setOptions` drops unknown keys**, so a flag on rp8's `options` silently never arrives -- put
  it on the prototype (`anyTaskChar`).
- **remark-footnotes names its inline-note reader `inlineNote`**, not `footnote`; a wrapper on a
  name nothing registers is an inert speed-up, which is why `precheck` now THROWS on one.
- **A `%%` comment's `value` must be the body as the reader saw it**, container prefixes
  stripped. Sliced from the source it carried `> ` and the writer re-added it every format -- 40
  of 57 never-settling round-trips were that one line.
- **`mdast-util-math` writes every `inlineMath` with `$`**, and rp8 does not read a padded
  `$ \nx\n $` as math: display math became TEXT on the first format until display nodes were
  written with `$$`.
- **A projection compensation for micromark can BREAK an rp8 tree that is already right.**
  Before "fixing" a position, compare the RAW node position with `compute`.
- **The Write tool turns a `\uFEFF` escape into a literal BOM**, and prettier reformats `src/rp8`
  between edits -- re-read before anchoring a scripted edit.

## Two presets, two audiences

|                                                                                                                          | `legacy` (default)                                         | `strict`                    |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------- |
| Obsidian's DOCUMENTED syntax (wikilinks, embeds, callouts, tags, `%%`, `==`, `$`, frontmatter, any-character task boxes) | on                                                         | **on**                      |
| What Obsidian DELIVERS beyond its standards (emphasis, lists, entities, autolinks, code spans, html blocks, link labels) | on                                                         | **off**                     |
| parser                                                                                                                   | vendored remark-parse 8 + Obsidian's readers               | micromark                   |
| consumer                                                                                                                 | Obsidian plugins (`obsidian-linter`, `obsidian-footnotes`) | **Quartz**                  |
| requires                                                                                                                 | exact tokens **and exact positions**                       | CommonMark/GFM + Obsidian's |

**The definition (the user's, 2026-10-27): `strict` is what Obsidian INTENDS, `legacy` what it
DELIVERS.** Obsidian's help says it "supports CommonMark, GitHub Flavored Markdown, and LaTeX" and
documents its additions (Obsidian Flavored Markdown, the syntax page: "You can use any character
inside the brackets to mark it as complete"). So `strict` = those standards + documented syntax,
and anything Obsidian does that neither describes belongs to `legacy` only. How to decide a
single case is in § 2.0 above.

Positions are a hard constraint for `legacy` — plugin consumers index by them, so a correct token
at a wrong offset is a failure.

**`strict` has a closed oracle.** The referee corpus measures `legacy`. `strict.test.ts` gates
`strict` differentially against stock `remark-parse` + `remark-gfm` over **676 examples**: the
652 CommonMark spec examples (`commonmark.ts`) plus the 24 tagged GFM extension examples
(`gfm.ts`). It stands at **8**, all by design: six hold Obsidian syntax and the two GFM task
lists gain `data.taskChar`. Its `LEAK` list is empty and must stay so. The live-probe gates
`strict-syntax.test.ts` (406 probes) and `strict-footnotes.test.ts` (107) cover what the specs
do not.

**Two specs are needed, not one.** GFM is "a strict superset of CommonMark" (spec §1.1), so
tables, task lists, strikethrough, extended autolinks and disallowed raw HTML appear in **no**
CommonMark example: a pass that "owns no spec example" against CommonMark alone means the spec
has no coverage there, not that it agrees. Footnotes are in **neither** spec: GFM froze at
`0.29-gfm` in 2019 and GitHub shipped footnotes in 2021 without specifying them.

## Gates — what "done" means

```bash
npm test          # 506 tests / 24 files. Contains the contract gate.
npm run typecheck # both tsconfig projects; the only type gate over test/
npm run lint      # src/**/*.ts ONLY -- does not cover test/
npm run format
npm run build
```

Inside `npm test`, the gates that matter most:

- **`parity.test.ts` is the contract** — "matches Obsidian 1.14.5 on every case marked match",
  3,469 of 3,469. If this regresses, nothing else justifies the change.
- **`compute.test.ts`** records the positioned oracle's ceilings inline, exact counts with ids.
  `legacy` stands at 8, every one Obsidian's cache (open items below).
- **`referee-spans.test.ts`** holds `referee-spans.json` to the vendored answers, so a re-sync
  without a re-recording fails.
- **`probe-ledger.mts` / `goldens/probes.json`** — 1,697 entries asserting **drift**, not
  agreement. There is no refresh subcommand on purpose; update `ours` only with a script that
  refuses to write when anything moved _away_.
- **`rp8-vendored.test.ts` and `rp8-speedups.test.ts`** — re-run after ANY change under
  `src/rp8`.
- **`pathological.test.ts`** — every shape under both presets, within a time budget. Four shapes
  are upstream's (`nested-blockquotes`, `callout-nest`, `delimiter-run`, `list-dash-sandwich`):
  remark-parse 8 recurses past the stack on them and throws a `RangeError` within a second, which
  the suite asserts rather than a parse. `strict` also skips `backtick-increasing`, which stock
  micromark takes 130 s on.

The referee is **a measurement, not a gate**. A referee gain with a contract-gate regression does
not ship — that has been tried (+4 referee, contract 3438 → 3434) and rejected.

## Instruments

All read `test/parity/referee-answers/` — **vendored**, resolved from the module rather than the
CWD — and need `--conditions=development`. `PARITY_REFEREE_DIR` overrides it, for pointing an
instrument at an upstream clone.

| instrument                 | answers                                                                    | trap                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `classify.ts`              | shared primitives: loading, position identity, populations, lift, sampling | **use this instead of re-reading the corpus**; `--self-test` must be green; it does NOT carry `refsTrustworthy` or `code` |
| `referee.mts`              | how many of 6,844 documents agree, on facts and on full spans              | diff `--ids` identities, **never totals**                                                                                 |
| `record-referee-spans.mts` | re-records `referee-spans.json` from the live cache (~15 s)                | keeps a span only where the fresh recording reproduces the vendored fact exactly                                          |
| `referee-shrink.mts`       | minimise a diverging document                                              | `--live` hits Obsidian                                                                                                    |
| `regressions.mts`          | which documents WE break that stock already gets right                     | organised by BLAME, not by rule; `--self-test` validates its restated agreement test against the referee's own count      |
| `ask.mts`, `ask-dom.mts`   | the live Obsidian oracle: cache, and DOM projections                       | see below                                                                                                                 |

**Restating the referee's test is how 1.1.0 was scored** (984 of 6,844, against 6,830): `named()`
drops empty-named rows, the compare is an ORDERED `JSON.stringify`, a `Def` is a FOUR-tuple, and
the referee also drops the 3 artifact references `referee-spans.json` names. Without that last
step a restatement reads 6,828; with it, 6,830 — the control.

**Upstream is ACTIVE, so re-sync rather than assume.** `Comprehensive-Jason/obsidian-footnotes`
is where the referee answers come from.

**A NAIVE RE-SYNC DEGRADES THE ORACLE, so compare row-by-row and take the MORE COMPLETE list.**
`metadataCache` only reports a reference whose name is DEFINED, so a raw recording is
definition-gated and systematically short. This corpus is the CORRECTED one — documents augmented
with synthesised definitions so the full list comes back — and rows carry `refsTrustworthy: true`.
At the last sync, 46 rows had upstream's refs a strict SUBSET of ours, 1 a superset, 0 a genuine
disagreement; overwriting the 46 would have replaced corrected answers with incomplete ones while
looking exactly like an update. The gating only ever REMOVES references, which is what makes
"take the longer list" the right merge rule. Re-run `record-referee-spans.mts` after any re-sync.

### Fuzzing: three sweeps, each blind where another sees

| sweep                          | oracle             | where                                     | finds                                                   |
| ------------------------------ | ------------------ | ----------------------------------------- | ------------------------------------------------------- |
| `fuzz/sweep.ts` (differential) | Obsidian, recorded | nightly, 500 seeds                        | n-way construct interactions, `legacy` only, tree facts |
| `fuzz/invariant-sweep.ts`      | none -- properties | per push (`fuzz-invariants.test.ts`, 600) | HTML, formatting, `strict`, every option set            |
|                                |                    | + nightly, 5,000 fresh seeds              |                                                         |
| `fuzz/charclass-sweep.ts`      | Obsidian, recorded | per push (`charclass.test.ts`, golden)    | character rules the fixed grammar alphabet cannot reach |
|                                |                    | + nightly, a fresh category sample        |                                                         |

**Until these fixes (after 2.0.2), the nightly job reported nothing, whatever it found.** It saved `status=$?` after
`| tee`, which is tee's status, so the last nights' 43-56 failing seeds read as success; and it
recorded without a window manager (DISPLAY written only to `$GITHUB_ENV`). Both are fixed, and
reports go to one rolling issue labelled `fuzz`.

**The differential sweep on 2.0, two rounds triaged against recordings of their minimal forms:**
round 1 (seeds 50647153+500): 481 agree (457 before 2.0), 19 causes; round 2 (71234567+500, self-
embeds skipped): 428 of 448 agree, 20 causes. The 39 fall into five groups:

| group                                            |  r1 |  r2 | state                                  |
| ------------------------------------------------ | --: | --: | -------------------------------------- |
| self-embed (`![[ ]]`, `![[#tag]]`)               |   6 |   - | out of scope; the sweep now skips them |
| line ending after `$$…$$` inside a paragraph     |   7 |   6 | open: fidelity cost                    |
| footnote bodies in the projection                |   4 |  10 | open: harness                          |
| block id ending an emphasis span or a table cell |   2 |   2 | open: `rehype-obsidian` rendering      |
| a `[` after a stray `]` (`(u)]][[`, `*]][`)      |   - |   2 | closed: harness projection             |

- **Self-embeds:** Obsidian embeds the note into itself and renders its tags, math and tasks six
  times. Vault resolution, `out-of-scope` like `fuzz/embed/64`.
- **`$$…$$` then a line ending:** Obsidian's renderer swallows it (`</span>http`, no `<br>`),
  remark-math 3 does not, so `legacy` keeps a `break`. Matching it means deleting the `\n` from
  the text, which formatting would write back as `$$y^2$$http`; left open.
- **Footnote bodies:** Obsidian's DOM moves them to the end, so links, math and headings inside a
  definition come after the main text, where `normalize.ts` projects source order (11). And it
  renders an inline footnote inside an UNREFERENCED definition, and a definition referenced only
  from an inline footnote inside itself, which our projection drops (3). Harness, open.
- **Block ids:** `x **^blk** y` and `| a ^blk |` register (we agree) and render without the `^blk`;
  `rehype-obsidian`'s block-reference pass only reads a `p`/`li`'s last text. Open.
- **Stray `]`:** `dropLabelOpeners` dropped the `[` after any unmatched `]`; Obsidian drops it only
  after a `]` that closed a label (`[x][[w]]`). Fixed, contract unchanged.

**What the new sweeps found and closed**, every one confirmed against the recorded answers:
math rendering other than its value (strict); formatting growing without bound (`$$a\$$b$$`, a
label sliced across a container prefix, raw source slices keeping escapes and indents);
formatting changing words (`\%%`, `\==`, `\#tag`, `[[target\]]`, an inline footnote's line
ending); tag characters; task boxes as one UTF-16 unit; NFC on link targets; U+2028/U+2029 ending a
wikilink; footnote labels lowercased rather than case-folded (strict). Plus harness defects in
`computeOurs` (task character, link display under NFC) and UPSTREAM.md item 9.

**Traps:** `fmt`-style probes that look a configuration up by name silently run `legacy` for a
JSON one; a "words" metric must not count node boundaries, and cannot see a loss the PARSE made
(the inline-footnote line ending needed its own assertion); the Write tool turned `\u` escapes
into literal (and invisible) characters three times in this work.

### `ask.mts` specifically

- Needs **Obsidian running with a vault open**.
- **Run it as `node --import tsx --conditions=development test/parity/ask.mts`, not through
  `npx tsx`.** Under `npx` it reports `Obsidian is not answering (got "")` while the same
  `obsidian eval` answers from a shell and from plain Node (2026-10-27, cause not isolated).
- **Never `2>/dev/null`.** It writes two load-bearing warnings to stderr: that `footnoteRefs` is
  definition-gated, and that the oracle runs **1.15.0** while goldens pin **1.14.5** — so do not
  settle a rule against the goldens with it.
- **Never `--synth` when reading references.** Synthetic answers omit the footnote keys entirely,
  so any probe reading refs through it measures nothing and looks like it worked.
- **`ask-dom.mts` uses the DETACHED renderer**, so on the known proxy divergences
  (`KNOWN_PROXY_DIVERGENCES` in `oracle.e2e.ts`) it gives the answer Reading View does not.

### Re-recording the goldens

`nix develop -c parity-record`; bare `npm run parity:record` fails with `ECONNREFUSED` because the
downloaded Obsidian needs the `nix-ld` the flake wires up. It takes about ten minutes, and its
log timestamps are UTC.

**Do not read `goldens/obsidian.json` until the run EXITS.** Phase 1 writes the file; phase 2
re-measures the known proxy divergences through a real Reading View and corrects them in place.
Read between the two, `commonmark/html-blocks/171` and `hunt/blockquote-region-outlives-quote/1`
hold the detached renderer's answers and the contract gate fails, which looks exactly like
Obsidian having changed. "no leaf for …" errors in phase 2 are one unopenable case, skipped.

Check a new case's markdown against `corpus.ts`, `commonmark.ts` AND `gfm.ts` before adding it —
the corpus deduplicates by markdown, so a collision displaces a triaged case silently — and read
the golden diff for displaced ids afterwards.

## Workflow

1. **Measure before choosing.** `referee.mts --ids` for identities; classify by position through
   `classify.ts`. Name-matching has produced a 12% contaminated classification and sent work
   after a mechanism that did not exist.
2. **Settle a rule live before building it**, with a known-positive control. For a family that
   resists feature analysis, ask the oracle rather than the corpus: 47 one-variable probes settled
   what observational measurement over dense documents could not.
3. **Find the construct in source** — `src/rp8/vendor/` for `legacy`, micromark's
   `node_modules/micromark/dev/lib/` for `strict`. Cite file:line in the commit.
4. **Exclude narrowly. Do not flip a global flag.** Measured on micromark: setting
   `self.interrupt` across the flow map cost 41 documents at zero gained; restricting it to three
   constructs cost 292; excluding one construct from the unflagged probe gained 32.
5. **Gate all of it**, then commit **separately** — never chain the gate run and the commit.
6. **A refusal with numbers is a result.** Record it here so it is not re-attempted.

**Finding which pass owns a `strict` divergence: derive it, do not reason about it.** Patch one
call site in `src/index.ts` to `if (false) …`, run the gate, read what moved. Restore, repeat;
then probe PAIRS for whatever is left, since a divergence can be owned jointly. Call sites sit at
several indentation depths: assert the matcher's count before believing a "no owner" result.

## Open items

Nothing here blocks a release; each is recorded with what is known.

**Closed during the release: `mathMidlineTransform` flattened the paragraph before its `$$`.**
Moving the split point of a `$$` that ends a line inside a container, it rebuilt the paragraph
as one `text` node sliced from the source, so every construct before the `$$` came back as raw
characters: under `* p ⟨code span⟩ end.` / `···2) $$` / `⇥$$`, stock `remark-math` keeps the code
span and `strict` lost it, and emphasis, wikilinks and tags went the same way. It now cuts the
existing children at the `$$`. The pass fires on 7 of 10,967 corpus, spec and referee documents
and moves no measured figure (fingerprints of 4,147 documents under 17 configurations
byte-identical; recorded cases, referee and spec unchanged), because the one firing document
holding a construct before the `$$` (`fuzz#2570`) keeps the same footnote facts either way. So
the gate is a unit test in `remark-obsidian.test.ts`, which fails on the old pass.

**Closed after 2.0.1: three `strict` passes wrote `math.value` without its render hint.**
`mdast-util-math` builds `data.hChildren` at parse time and HTML renders from it, never from
`value`, so `mathMidlineTransform`, `mathFenceTransform` and the reading pass's placeholder restore
left trees that looked right and HTML that did not (`1. Hello $$` / `   Math` / `   $$` rendered
an empty block): 86 strict documents of 10,991, none under `legacy`. Write a formula through
`setMathValue` (`math-value.ts`), never by assigning `value`. `invariants.test.ts` asserts hint ==
value under BOTH presets; every other gate there runs the legacy profiles, which is why the
parity corpus never saw it.

**Closed after 2.0.1: tag characters follow Obsidian's own rule** (issue #1's closing note,
`#§section`). Both presets used a class of letters, marks, emoji and digits; Obsidian ends a tag
only at whitespace, ASCII punctuation other than `/ _ -`, and U+2000-U+206F / U+2E00-U+2E7F.
Swept live (1.15.0) over 163 characters, every block boundary included: the old class agreed on
97 (legacy) and 85 (strict), the new one on all 163. `src/lib/tag-char.ts` is the one predicate
both presets call. No recorded document exercises it -- old and new tag output are identical
over all 10,991 corpus, spec and referee documents under both presets -- so the gate is the
unit test "reads a tag's characters as Obsidian does", which fails on the old class.

1. **Two `strict` cases left by decision:** an unbalanced `[[[a]]` inside a link label, which
   breaks the link's bracket count in micromark; and a `$$` line interrupting a lazily continued
   definition in a list item.
2. **micromark itself departs from CommonMark** on `> a` / `2. x`: it starts a list where the
   spec (and Obsidian) continue the quote's paragraph, since `2.` cannot interrupt one. A
   question about stock `remark-parse`, not this package; `strict.test.ts` cannot see it.
3. **The referee's 14** — nothing fixable left in `legacy`. 10 are Obsidian cache misplacements
   where our position is the true one (must not fix); 4 carry references only the corrected
   answers have, inside code or an unclosed fence (`reproducers.json#852` is the one 1.x got
   right).
4. **The positioned oracle's 8** — all Obsidian's cache: 2 P1, a garbled embed inside an
   unclosed `%%`, two phantom block ids past the text, one embed ordering, and an empty item
   whose own rendering nests the next one as we do.
5. **`normalize.ts`** carries compensations for micromark's offsets. Only rp8 trees reach it now
   (every gate runs the `legacy` profiles), and two compensations already had to be generalised
   because they broke rp8 positions that were right. Simplifying it is safe but unmeasured.
6. **Formatting still changes words** in 87 of 600 per-push seeds (listed exactly in
   `fuzz-invariants.test.ts`): an escape or character reference the writer adds starting or
   ending a tag (`](#tag` -> `]\(#tag`, `&#x20;#tag`), CommonMark emphasis spellings remark-parse 8
   reads otherwise (`*\*em\**`), setext underlines; and `$a\$ $b$` is written as display math.
7. **The fuzz triage's open three** (above): the line ending after paragraph `$$…$$`,
   footnote bodies in the projection (order, and which render), and a block id ending an
   emphasis span or a table cell.
8. **Micromark-era instruments.** `mechanism.mts`, `ablate*.mts`, `legacy-oracle.mts`,
   `pass-owner*.mts`, `pass-order*.mts` and their kin attribute behaviour to micromark passes
   `legacy` no longer runs. Port to `strict` or delete; do not trust their `legacy` output.

## Rules that each cost a session

- **`self.containerState` must be saved and restored** around any container-interrupt probe in a
  micromark construct. Container constructs write into it. Without this: 0 gained / **1,172
  lost**.
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
  stdout, while vitest prints the assertion summary single-quoted. Assert the count you expect
  before using what you extracted.
- **An inert probe looks exactly like a working one.** Verify by identity (`--ids`), not by total.
- **Only a KNOWN-POSITIVE control proves a probe is live.** A negative control passes happily and
  proves nothing. Scripts scraping tool output must capture **both streams** and must not assume
  a quote style.
- **A clean exit can still lose data, so verify an instrument's output by COUNT.**
  `console.log` then `process.exit(0)` discards whatever a pipe has buffered, and one large
  `fs.writeSync` to a pipe comes back partial. Queue through `process.stdout.write` and do not
  exit.
- **Never reimplement an oracle's agreement test without its control.** A restatement without
  `named()` manufactured a plausible, well-shaped family that did not exist.
- **A probe must go through `parseOurs`, not a hand-built processor.** The harness applies
  `applyTextTransform` and the `quartz-default` profile; a locally assembled chain measures a
  pipeline nobody uses.
- **Use the Edit tool, not scripted `python3`/`sed`, on prettier-formatted source.** Silent
  regex misses have cost four edits; nested parens defeat naive patterns.
- **`disable` matches on construct NAME.** A vendored replacement must take a new name or a user
  disabling the stock name silently disables ours too.

## Conventions

- Conventional commit subjects. Bodies carry the **measurement** and a parity delta line.
- Every behaviour change gets a changeset. A provably inert `src/` change gets reverted, not
  shipped as dead code.
- Fix forward; do not rewrite history. The one exception was deliberate: 2.0 replaced the
  micromark-era history on `main` with a single commit on `v1.1.0`, with the old history kept
  under the `archive/*` tags.
- `test/parity/README.md` is the harness's operating manual: how to record, what is compared,
  how to triage. Keep it operational; measurements and refusals belong here. Its 1.x version, a
  12,300-line lab notebook, is under `archive/main-pre-2.0`.
