## 2.0.0

### Major Changes

- 81c49ef: Stop crashing on a task list in the real pipeline.

  Three transforms re-parsed a fragment with `self.runSync(self.parse(md), md)`,
  where `self` is the whole processor. `runSync` refuses as soon as that
  processor holds an asynchronous plugin — `rehype-obsidian` is one in the
  Quartz chain — so **any task list, or any `%%` comment with a tail, threw
  `runSync finished async`** rather than rendering.

  Every mdast-level test passed throughout, because the parity harness builds a
  markdown-only processor where nothing is async. Only driving the full chain
  end to end exposed it.

  A fragment is now re-parsed through this plugin's own passes, recursing into
  its transform rather than running the entire processor. That stays
  synchronous, and fragments only ever shrink, so it terminates for the same
  reason the previous call did. Obsidian parity is unchanged at 2070 of 2211
  with no regressions, which also shows the fragment never needed the rest of
  the chain's transforms.

- e69f3cb: Stop corrupting documents on a second formatting pass.

  Two serialisation defects, both of which damaged ordinary content rather than
  edge cases, and neither visible to any parity projection.

  **An aliased wikilink inside a table cell split the row.** The wikilink
  handler builds its own string instead of going through `state.safe`, so
  nothing escaped the alias separator — `| [[Note\|Alias]] |` was written with a
  bare pipe, read back as two cells, and the second pass rewrote the table. The
  pipe is now escaped inside a cell.

  **A line break grew a backslash on every pass.** A break was written as a
  trailing backslash, which in a chain with `remark-breaks` — the chain this
  package is built for, and the one Quartz pins — asserts a hard break the
  source never had. Every multi-line paragraph gained a backslash the first time
  it was formatted, and inside the legacy highlight and emphasis scans it never
  settled at all: those read raw codes rather than CommonMark escapes, so
  `==text\==` keeps `text\` as content, and the backslash compounded without
  bound. A break is now written as a newline.

  New `escapedLineBreaks` option restores the old spelling for a consumer whose
  chain has no `remark-breaks`, where a break really is a hard break.

  Inputs that formatting cannot settle fall from 97 to 24. Obsidian parity is
  unchanged at 2070 of 2211.

- 5ab8693: Keep a footnote reference nothing defines, instead of baring it in the tree.

  Obsidian consumes a reference's delimiters even when nothing defines it, so
  `see [^x]` displays as `see x`. That was reproduced by rewriting the text node
  to `see x` — but a node value is not a rendering. The node went on claiming the
  span `see [^x]` while no longer reproducing it, so a formatter serialising this
  tree wrote the shorter text back and destroyed a reference the author had
  merely not defined yet, which is ordinary in a real note: written before the
  definition, or simply mistyped.

  An undefined reference now stays a `footnoteReference`, which round-trips to
  `[^x]` exactly, label case included. Baring it is the renderer's job;
  `rehype-obsidian` does it, so rendered output is unchanged.

  `footnoteOrphanTransform` is removed with its export: it re-flattened an
  undefined reference one layer later, and did so from the label rather than the
  identifier, which showed the wrong case.

  Breaking twice over, which is why this is a major: an undefined reference used
  to arrive as a `text` node and now arrives as a `footnoteReference`, so a
  consumer matching on bare text must match on the node instead; and
  `footnoteOrphanTransform` is gone from the public exports.

### Minor Changes

- 7792a21: Read a footnote label that holds a bracket

  A footnote label runs to the **first** `]`, with no balanced counting and nothing parsing
  inside it. `[^a[b]c]` renders `a[bc]` — the label `a[b` with `c]` left as text — and
  `[^[[a]]]` is a reference to `[[a` with `]]` left as text, where we built a wikilink to
  `a`.

  That is a different scan from a link label, which _is_ balance-scanned. An outer link
  still outranks it: `[^[note]](url)` is a link whose label holds an inline footnote.

  This also closes the doubled inline-footnote opener — `[^[^1]` is a reference to `[^1`,
  not a dropped construct — so the eighteen cases previously declared unfixable are now
  seventeen matches and one `replicate`.

- 7bedd74: Build the outer link even where no inner link exists

  Label precedence previously fired only where the tree had already found a link. It now also
  fires where raw scanning finds a label and destination the tree found _nothing_ for — which
  is what a code span, an html attribute, a math span or a comment swallowing the `](u)`
  leaves behind. `[foo`](u)``is a link to `u` labelled`` foo` ``, as are CommonMark's spec
  examples 342, 519, 522, 524 and 525.

  Three things made that safe. A full CommonMark destination reader, so a title no longer
  lands in the url. A guard asking the _tree_ whether an image, wikilink or footnote
  reference already owns the bracket. And a guard for a construct that opened earlier and
  still encloses it — whichever opens first wins, so `[foo *bar](u)*` is a link while
  `*[foo*](/uri)` is emphasis.

- 7b71f7c: Give the outermost bracket pair the link

  Obsidian finds a link label by raw balanced-bracket scanning, so the outermost pair wins
  where CommonMark gives the innermost — `[a [b](u) c](v)` links to `v` and shows `[b](u)`
  as written, and `[a [b [c](u) d](v) e](w)` links to `w`.

  CommonMark forbids a link inside a link and resolves it the other way round, which is its
  spec examples 518 and 526. A wikilink inside a label still resolves, and so does an
  autolink: only a link written in bracket form is shown literally.

  New `labelPrecedence` option. It shipped behind one because 369 corpus cases hold a nested
  bracket pair; the measured cost of enabling it is **0 regressions**, so it is on by
  default.

- 883f1fd: A setext underline takes a quote's last lazy line away from it.

  `> a` / `b` / `---` is a blockquote holding only `a` in Obsidian, with `b` and the
  underline forming a heading at root. CommonMark lazily continues `b` into the quote and
  leaves the run as a thematic break, so the heading never appeared.

  Three measured details, each a case this would otherwise get wrong:

  - only the **last** lazy line leaves, so `> a` / `b` / `c` / `---` keeps `b` in the quote
  - a line that is actually quoted never leaves, which keeps `> a` / `---` a quote plus a
    break and `> a` / `===` a quote that absorbs the run
  - a **list** is the other way round and absorbs its lazy line instead

- 7d9d4c3: Let an inline-code opener retry with a shorter width

  CommonMark requires a closer of exactly the opener's width and leaves the whole run
  literal without one. Obsidian instead sheds backticks from the left until the opener
  matches a closer that does occur ahead, so ` `code` `` is a literal backtick followed
by a code span holding `code`, and ``` ```code` ``` is two literal backticks and the same
  span. A short opener never grows — `` `code`` `` stays literal either way.

  Context turned out to be irrelevant: emphasis, strong, heading, blockquote, list item,
  table cell and link label all behave exactly as the bare case.

  New `legacyCodeSpans` option, on by default. It also makes a pathological document
  dramatically **faster**. cmark's increasing-run shape makes every opener scan to the end
  of the context and fail, which is superlinear in stock micromark — 2.1s at 125KB, 132s at
  2MB. Those openers are precisely the ones this rule decides, so they are now settled from
  a run index built once per text context and stock never runs the failing scan: 620ms
  against 130s at 2MB, 210x faster, and linear in bytes where stock is not.

- 9bc3f07: Add `legacyContainerLazy` and `legacyLinkDestinations`, and extend `legacySetext` to the pass that
  owns `link-reference-definitions/216`. This closes the strict preset's actionable backlog.

  Six more passes ran unconditionally, with no option for `strict` to clear:

  - `legacyContainerLazy` — `containerLazyTransform`, `listEmptyItemTransform`,
    `listDeepContinuationTransform`. `remark-parse@8` decides which following lines a list item or
    blockquote still owns by a different rule than micromark.
  - `legacyLinkDestinations` — `angleDestinationEscapeTransform`, `linkNbspTitleTransform`. rp8
    resolves an escape inside an angle-bracketed destination differently, and treats a NO-BREAK
    SPACE as a destination/title separator where CommonMark does not.
  - `legacySetext` now also gates `definitionSetextTransform`, which owns
    `link-reference-definitions/216`.

  <!-- prettier-ignore -->
  ```
  strict divergence from stock remark-parse + remark-gfm   15 -> 8 of 652
    by design (Obsidian syntax)   7
    position only                 0
    structural backlog            1   raw-html/626, already a recorded refusal
  legacy referee                  6208/6818, BYTE-IDENTICAL
  ```

  Every owner was derived by disabling one unconditional pass at a time and reading which spec
  examples began to agree: 57 probed, 6 owning anything, 51 owning nothing. All five options default
  to `true` and are cleared by `preset: "strict"`, so `legacy` consumers see no change — verified by
  `--ids` identity rather than an equal total.

- 6a6fcd4: Let an email autolink hold a backslash

  `<foo\+@bar.example.com>` links to `mailto:foo\+@bar.example.com` and shows the
  backslash, as `remark-parse@8` does. CommonMark reads `\+` as an escaped plus, fails the
  email pattern, and leaves the brackets as text.

  The failure is worse than a missing link. `<a\b@c.test>` escaped the `b`, dropped `<a\` as
  text, and GFM then autolinked the remaining `b@c.test` — a working link to an address that
  is not in the document.

  Scoped to the email branch, because that is the whole measured divergence: a URI autolink
  already keeps its backslash, and so does `mailto:`. New `legacyAutolinks` option, on by
  default.

- d8e2755: Resolve a character reference written without its semicolon

  CommonMark requires the terminator, so micromark leaves `&amp` as four characters
  where Obsidian renders `&`. The rule is HTML's historical one, and the legacy stack
  agrees with the app on every case:

  | source  | Obsidian |     | source         | Obsidian |
  | ------- | -------- | --- | -------------- | -------- |
  | `&amp`  | `&`      |     | `&notreal`     | `¬real`  |
  | `&copy` | `©`      |     | `&ampx`        | `&x`     |
  | `&#35`  | `#`      |     | `&nosuchthing` | literal  |
  | `&AMP`  | `&`      |     | `` `&amp` ``   | literal  |

  Named references from HTML's legacy table resolve bare and match **greedily**, which
  is why `&notreal` stops after `not`. Numeric references resolve bare too. Anything
  outside the table stays literal, and a code span still protects its contents.

  New `legacyEntities` option, on by default for the same reason as its neighbours:
  leaving it off silently shows markup the app resolves.

  The scan is bounded by the longest name in the table rather than reading to end of
  file, so a construct on a character as common as `&` cannot become quadratic.

  All 14 `probe/entity/*` cases match, from 5.

- 0315887: Add `legacyLinkDefinitions`, so the strict preset decides link reference definitions the way
  CommonMark does.

  `legacyDefinitionTransform` and `legacyDefinitionPromoteTransform` ran unconditionally despite
  being named for the legacy reading. `remark-parse@8` admits a definition CommonMark rejects and
  promotes one CommonMark leaves as paragraph text, so `strict` emitted a `paragraph` where
  CommonMark emits a `definition` on six spec examples:
  `commonmark/link-reference-definitions/196`, `200`, `202`, `210`, and `commonmark/links/546`,
  `552`.

      strict divergence from stock remark-parse + remark-gfm   26 -> 20 of 652
      legacy referee                                           6208/6818, BYTE-IDENTICAL
      main parity gate green, 453 tests, 0 probes drifted, 4 gates green

  Distinct from `labelPrecedence`, which governs how a link label's brackets are scanned; this one
  governs whether the definition forms at all. It defaults to `true` and is cleared by
  `preset: "strict"`, so `legacy` consumers see no change — verified by `--ids` identity rather
  than by an equal total.

  `link-reference-definitions/216` and `links/493` are NOT covered by this flag and remain
  recorded: they have a different cause, which is why the measurement was taken before the option
  was written rather than after.

- c6e54f8: Add `legacyLists`, replacing CommonMark's list container with Obsidian's.

  Obsidian runs a fork of `remark-parse@8`, whose list parsing is more permissive than
  CommonMark's. Two divergences covered:

  - an ordered marker has **no nine-digit ceiling**, so `1234567890. not ok` is a list with
    `start=1234567890` rather than a paragraph
  - a sibling marker may be indented up to the open item's own indent rather than a fixed
    three spaces, so ` - a` / `  - b` / `   - c` / `    - d` is four flat items rather than
    three and an indented code block
  - an **empty** item may interrupt a paragraph, so `foo` over `*` is a paragraph and then an
    empty list — except for a dash, which is also a setext underline, and the underline wins

  On by default: turning it on costs **0 regressions** across the 3103-case parity corpus
  for 5 cases gained, and improves the independent `metadataCache` oracle on two counters.

  Two cases in the family remain and are recorded rather than chased -- a tab-indented
  sibling, and an under-indented continuation that needs `remark-parse@8`'s whole-item
  minimum-indent scan rather than a different limit.

- 6d52668: Add `legacySetext`, so the strict preset stops reading setext underlines as Obsidian does.

  Five setext passes ran unconditionally — `lazySetextTransform`, `containerSetextTransform`,
  `setextUnderlineTransform`, `htmlSetextTransform` and `multilineSetextTransform`. There was no
  setext option, so `preset: "strict"` had nothing to clear and Obsidian's reading applied
  off-platform, where it helps nobody.

  The effect was measurable and is now gated: six CommonMark spec examples —
  `setext-headings/81`, `82`, `84`, `86`, `93` and `95` — emitted a `paragraph` where CommonMark
  emits a `heading`. All six now agree.

      strict divergence from stock remark-parse + remark-gfm   32 -> 26 of 652
      legacy referee                                           6208/6818, BYTE-IDENTICAL
      main parity gate green, 453 tests, 0 probes drifted, 4 gates green

  `legacySetext` defaults to `true` and is cleared by `preset: "strict"`, so **`legacy` consumers
  see no change at all** — the referee's agreeing set is identical by `--ids`, not merely equal in
  total.

  `definitionSetextTransform` is deliberately left ungated: it is also a setext pass, but gating
  the other five closed every measured divergence, and the smallest change that closes the
  measurement beats the one that looks symmetrical.

  This follows from the policy that any behaviour differing between `legacy` and `strict` belongs
  behind an option rather than in an unconditional pass.

- 72109dc: Added a `preset` option with two values, `legacy` and `strict`.

  `legacy` is the default and is every option at the value the parity corpus is measured
  against, so nothing changes for an existing consumer. `strict` keeps Obsidian's syntax --
  wikilinks, embeds, callouts, tags, `%%` comments, `==highlights==`, `$math$`, frontmatter --
  while parsing everything CommonMark and GFM already define the way they define it, which is
  what a consumer outside Obsidian usually wants.

- 87107e2: Parse `~~` the way Obsidian does, via a port of `remark-parse@8`'s delete tokenizer

  Obsidian's strikethrough closes on the first `~~` it reaches, honours no escape at
  all, and requires a double tilde:

  - `~~del\~~` is a `delete` holding `del\`, where GFM reads `\~` as an escaped tilde
    so the closer never forms and the whole run stays literal.
  - `]]~~~~` renders `]]`, because `~~~~` is an _empty_ delete rather than four tildes.
  - `~x~` is literal text; single-tilde strikethrough is a GFM extension Obsidian
    does not have.

  New `legacyStrikethrough` option, on by default for the same reason
  `legacyEmphasis` is: leaving it off silently produces different strikethrough from
  the app.

  **Requires `remark-gfm` to be registered before this package.** A combined
  micromark extension prepends its constructs, so for a code both claim the
  later-registered plugin wins; with gfm second it owns `~` and this option is inert.
  `@quartz-community/obsidian-flavored-markdown` therefore needs to order _after_
  `@quartz-community/github-flavored-markdown`.

  Measured on the recorded corpus: the reorder alone is behaviour-neutral (0 fixed, 0
  broken), and the tokenizer on top of it fixes 21 cases with no regression.

- 0690d8b: Add `legacyTables`, and gate the strict preset against the GFM spec's extension examples.

  The CommonMark differential was structurally blind to GFM extensions. GFM is "a strict superset of
  CommonMark" (spec §1.1), so tables, task list items, strikethrough, extended autolinks and
  disallowed raw HTML appear in **no** CommonMark example — meaning "this pass owns no spec example"
  meant "the spec has no coverage there", which is not the same claim as "this agrees". Obsidian's
  own documentation cites this spec for its GFM support.

  `test/parity/gfm.ts` adds the 24 tagged extension examples from `cmark-gfm`'s `test/spec.txt`, and
  they found three divergences on arrival — all tables, all structural:

  <!-- prettier-ignore -->
  ```
  gfm/table/199   stock: table/tableRow/tableCell    ours: paragraph + break nodes
  gfm/table/202   stock: 3 tableRows                 ours: 2 rows + paragraph
  gfm/table/203   short delimiter row mishandled
  ```

  `199` is a delimiter row without leading or trailing pipes; `202` drops a trailing pipeless row
  that GFM absorbs into the table. Both would render wrongly in Quartz today.

  `legacyTables` gates all six table passes. Only `tableShortDelimiterTransform` owns an example
  alone — `199` and `202` need the group, which is why the guard covers all six rather than the one.

      strict gate corpus   652 -> 676 examples (CommonMark + GFM extensions)
      GFM extension divergences   3 -> 0
      legacy referee              6208/6818, BYTE-IDENTICAL

  The other two GFM-extension passes are now **verified rather than merely uncovered**:
  `autolinkLiteralExtentTransform` and `bareCheckboxTransform` agree across all 16 autolink,
  strikethrough and task-list examples, so no option is warranted for them.

- 7f69642: Add `legacyTabs`, so the strict preset expands tabs the way CommonMark does.

  CommonMark advances a tab to its next four-column stop everywhere. `remark-parse@8` does not: one
  raw tab is a whole indent wherever it starts, and a tab after a space reaches no stop at all. Six
  passes carried that reading across quotes, lists, thematic breaks and the indented-code
  threshold, all of them unconditional, so Obsidian's tab arithmetic applied off-platform.

      strict divergence from stock remark-parse + remark-gfm   20 -> 15 of 652
      legacy referee                                           6208/6818, BYTE-IDENTICAL
      main parity gate green, 453 tests, 0 probes drifted, 4 gates green

  Closed: `tabs/2` and `tabs/11` and `block-quotes/238` differed in node type; `tabs/6` and
  `tabs/7` differed in position.

  The six passes were derived rather than guessed. Fourteen tab and indent passes were probed one
  at a time: four own exactly one example each — `quoteTabTransform`, `listTabTransform`,
  `thematicBreakTabTransform`, `indentTabTransform` — and ten own none. `block-quotes/238` is owned
  _jointly_ by `quoteIndentedCodeTransform` and `quoteLazyIndentedCodeTransform`, so both are in
  the guard and neither closes it alone.

  The ten that own nothing keep running. Most operate on footnote definitions, which the CommonMark
  spec has no example of, so the spec cannot adjudicate them in either direction — gating them
  would be an unmeasured change.

  `legacyTabs` defaults to `true` and is cleared by `preset: "strict"`, so `legacy` consumers see no
  change, verified by `--ids` identity rather than an equal total.

- 19b84dd: Match Obsidian on display math, task bodies, tag boundaries and comment nesting.

  **`$$…$$` is display math wherever it appears.** Obsidian renders `$$E=mc^2$$`,
  `- $$x^2$$` and `# $$x^2$$` as display math inside the surrounding block, while
  `micromark-extension-math` classifies by position and reports them as inline. An
  `inlineMath` node whose source begins with two or more `$` now carries
  `data.display = true` and renders with `math-display` rather than `math-inline`.
  The node stays inline on purpose: Obsidian's own output is an inline element with
  display styling, not a block.

  **A task body is reparsed as block markdown.** `- [ ] 1.` nests an empty ordered
  list inside the task item and `- [ ] > quote` nests a blockquote, matching
  Obsidian; a body that stays a paragraph is left untouched. Controlled by the new
  `taskReparse` option, on by default.

  **Tag boundaries follow Obsidian.** `#tag#tag` is two tags rather than one, and a
  tag may start directly after an inline construct, so `a**b**#next` and
  `a[[t]]#next` tag `next` while `foo#next`, `(foo)#next` and `foo.#next` still do
  not. Two causes: `#` and `*` are emoji keycap bases and so matched `\p{Emoji}`,
  and the boundary is the end of a construct rather than the character before it.

  **A comment that could close on its own line is inline.** Obsidian prefers an
  inline comment whenever one would close on the opening line, so `%%text%%` alone
  on a line is a paragraph containing a hidden comment rather than a block comment.
  A block comment now only wins when the comment spans lines. This changes the block
  structure such input produces, though the rendered text is unaffected.

  Two notes on scope. The inline-math flanking gate added previously is bypassed
  when a consumer also registers stock `remark-math` for `$`, because micromark
  falls through to the ungated construct; resolving that needs the duplicate
  registration removed upstream. And `micromark-extension-math` asserts its own
  `previous` guard internally, so the remaining mismatched-delimiter cases such as
  `$x^2$$` cannot be fixed by gating it from outside.

- 211ffb3: Add the missing `callout` serializer, and gate serialisation.

  Every construct this package adds shipped a `toMarkdown` handler except the
  callout, because a callout is produced by a transform rather than a syntax
  extension and the transform only ever needed the parsing half. The result was
  that `mdast-util-to-markdown` threw `Cannot handle unknown node 'callout'` on
  any tree holding one, so the package could not serialise the commonest
  Obsidian block — the exact path a formatter such as `obsidian-linter` takes.

  58 of the 1531 corpus cases threw on serialisation; none do now.

  A new gate covers the half the parity corpus never did. Serialising must never
  throw, and formatting must reach a fixed point: the first pass may normalise,
  the second must change nothing. 1455 of 1531 cases settle; the 76 that do not
  are pinned so the set cannot grow, and include two worth knowing about — a
  wikilink alias pipe is not escaped inside a table cell, so a second pass splits
  the row, and an escaped line break inside a highlight or emphasis gains a
  backslash on every pass.

- 0f3dbb2: Convert soft line endings into positioned `break` nodes

  `remark-breaks` is four lines that throw positions away. It calls `newlineToBreak`,
  which is `findAndReplace(tree, [/\r?\n|\r/g, replace])`; `replace` returns a bare
  `{type: "break"}` and `findAndReplace` rebuilds the surrounding text as
  `{type: "text", value}` — no position on any of the three.

  Doing the same conversion first, with positions, leaves its regular expression nothing
  to match, so the tree is identical and every node keeps its place. This package is
  ordered before `remark-breaks` in the chain, which is what makes that possible.

  Across the recorded corpus that places **1020 of 1188** previously positionless nodes —
  512 breaks and 641 text halves, 97% of every unplaced node. Ten of the twenty
  parent-child pairs in the position ceiling drop to zero outright.

  New `positionedBreaks` option, on by default. Turn it off for a chain with no
  `remark-breaks`, where a soft line ending is not a `break` at all.

  A newline written as a character reference is the one case this declines: `&#10;` puts
  a newline in the value with none in the source, so the offsets would be guesses. One
  document in 2811.

- ff230cb: Match Obsidian on nested wikilink targets and line endings inside highlights.

  **A wikilink target may not contain `[[`.** A single `[` is a legal target
  character, but a doubled one is not, so `[[[[target]]` resolves to `[target` and
  `![[![[target]]]]` resolves the inner embed to `target`. Rejecting the target lets
  the tokenizer retry one position along until it finds a clean one, which is how
  Obsidian arrives at the same results.

  **A highlight keeps its line endings.** `==a\nb==` now yields a single highlight
  containing `a\nb` rather than `ab`. `mdast-util-from-markdown` only preserves line
  endings inside node types listed in `canContainEols`, and the highlight extension
  did not declare itself; `mdast-util-gfm-strikethrough` declares `delete` for the
  same reason, which is why strikethrough was unaffected.

- 8d99e0d: Fix parser defects found by differential testing against real Obsidian.

  **Comments no longer violate a micromark invariant.** An inline comment followed
  by text on the same line, such as `%%note%% and more`, and empty markers such as
  `%%%%`, corrupted micromark's token stream. Builds strip the assertion that
  catches this, so the failure was silent in production and only surfaced when the
  `development` export condition was resolved. Fifteen inputs were affected, all of
  them ordinary usage. The flow construct now yields to the inline tokenizer when a
  comment does not own the whole line, and no longer opens an empty content token.

  **Highlights follow flanking rules and parse their content.** `==` is now an
  attention construct, matching how micromark implements emphasis and
  strikethrough. This brings three behaviour changes, each verified against
  Obsidian 1.13.7:

  - `before ==text == after` and `before == text== after` no longer highlight,
    because a delimiter adjacent to whitespace cannot open or close.
  - `==a **b** c==` parses the nested emphasis instead of keeping it literal.
  - A highlight may span a line ending, as it does in Obsidian.

  Depending on `==text ==` producing a highlight is the one case where existing
  output changes without the old output having been correct.

  **A currency amount is no longer inline math.** `$5 and $10` parsed as math with
  the body `5 and`, because `micromark-extension-math` applies no flanking rules. A
  lone `$` followed by a digit or whitespace can no longer open. Note this gate is
  bypassed if a consumer also registers stock `remark-math` for the same character,
  since the fallback construct still matches.

  **Wikilink targets are trimmed.** `[[ page ]]` resolves to `page`.

  **Tags accept astral characters.** `#😐` produced no tag: micromark yields UTF-16
  code units, so an emoji arrives as two surrogates and neither half matches a
  unicode property escape.

### Patch Changes

- 9f3aed1: A footnote label keeps its backslash inside a container.

  `alignToSource` rebuilds a text node's value from its source so a spliced reference gets
  an exact position. A paragraph inside a container defeated it -- the source carries the
  continuation indent and the value does not -- so the alignment was dropped and the label
  came from the value, where micromark had already resolved the escape. The strict pass is
  now followed by one that skips whitespace after a line ending, with `at[]` still recording
  every kept character's real offset.

  Two cases, and 20 previously unplaced nodes now carry exact positions.

- 5bab583: A footnote reference inside a quoted multi-line paragraph carries a position.

  `> q` over `>   near [^b]` places the reference and the text around it, where a quote's
  stripped `> ` prefix had defeated the alignment entirely.

- 3c5f42e: A backslash is an ordinary character inside an angle-wrapped link destination.

  `[link](<foo\>)` is a link whose path is `foo\`: the backslash is literal and the `>`
  closes the destination. micromark reads `\>` as an escape, so the destination never
  terminates and nothing links. Held to destinations that actually hold a backslash, which
  keeps it off the seventeen matching `](<` cases.

- 9b12dca: An email autolink literal is written back bare instead of gaining a pair of angles.

  `mdast-util-to-markdown` offers `<...>` shorthand whenever a link's text equals its
  destination, without checking that CommonMark would actually autolink that address. For a
  domain holding `_` or a trailing `-` it will not, so `write a@b_c.com now` became
  `write <a@b_c.com> now`, whose re-parse leaves the angles as text and gains another pair
  every pass.

  An address CommonMark rejects cannot have arrived through `<...>`, so the source held a
  bare literal and writing it bare is lossless as well as stable. Upstream bug, confirmed at
  `mdast-util-to-markdown@2.2.0`.

- 96af908: A bare URL runs to whitespace, and nothing inside it parses.

  GFM stops an autolink literal at `](` and lets the remainder tokenise, so
  `https://e.test/p](`code`` grew a code span and `...]([[#tag]]` grew a wikilink. Obsidian
  keeps everything to the next space in the link, so neither forms. Angle autolinks still
  end at their `>`.

- d6b84a8: A checkbox with nothing after it on its own line is not a task.

  `- [ ]` followed by a lazy continuation reports the plain marker `-` in Obsidian's cache,
  not the checkbox character.

- fd534b3: A checkbox with nothing after it on its line is not a task.

  Obsidian wants the content on the same line: `- [ ]` followed by `===` is a list holding
  the text `[ ]`, and `- [ ]` followed by `![[*` reads `[ ] ![[*`. Neither reports a task.
  Micromark marks the item whenever content follows, and a lazy continuation counts, so the
  `[ ]` vanished from the rendered text.

  The checkbox goes back as text rather than being dropped, because it is still in the file.

- dc947a1: A footnote definition under an empty list item now starts at the marker's own width, not one
  column further.

  CommonMark gives an empty item a content column of `W + 1` where `W` is the marker's width.
  Obsidian gives `W`: under a bare `-` a definition indented one space reports column 1, and under
  a bare `10.` an indented definition reports column 3. The `+1` belongs to a separator that is
  actually present, so `- ` really is 2 and `10. ` really is 4.

  The content-column helper required at least one space after the marker, so an empty item never
  matched it and the column fell through to an unrelated fallback.

  Eleven probes recorded against the running application move to agreement, with the referee
  figure, the code-range dimension and the corpus all unchanged.

- 1e1450b: Stop autolinking a bare URI scheme, matching Obsidian.

  Obsidian's tokenizer requires `@` or `://` before it will call a `<…>` an autolink, so
  `<a+b+c:d>` and `<localhost:5001/foo>` are ordinary text there. Stock micromark needs only
  a `:`, and linked both.

  `<mailto:a@e.test>` is unaffected: it holds an `@` and goes through the email branch
  instead, which is why every recorded case with a `//`-less scheme already matched.

- 251068f: A footnote label of only whitespace defines nothing.

  `[^ ]: x` is two paragraphs in Obsidian, rendering `[^ ] [^ ]: x`, where micromark's
  gfm-footnote builds a definition named `" "` and hides the body. The asymmetry is
  upstream's: a _reference_ `[^ ]` is already refused there, so only the definition half
  accepts a label its own reference will not match.

- 192a907: A link label of only whitespace resolves against its definition, and a shortcut reference
  serialises as its own label.

  `[⏎ ]` over `[⏎ ]: /uri` is an anchor with no content in Obsidian. The parse half was
  reverted once because `mdast-util-to-markdown` collapses `[text][reference]` to `[text]`
  only when the two spell the same thing, and escaping made them differ — so the formatter
  wrote the label twice. A `linkReference` handler fixes that, and both now round-trip at a
  fixed point.

- 0fb4ef4: After a blank line, a list item judges its content against the column it opened with.

  An item's content column falls as shallower lines arrive — that is `remark-parse@8`'s
  de-indentation minimum and it is why a wide-separator item can hold content at all. A blank line
  ends that: lines after it are measured against the column the item started with, not the lowered
  one.

  `2)` five spaces `More` over two spaces `===` over a blank over two spaces `[^2]: body` is a
  definition at **root**, column 0, in Obsidian. The separator caps the item's content column at
  three; the `===` line at two columns lowered it to two before any blank was seen, and the label
  at two columns then looked like ordinary content. Compared against the opening three it is
  correctly shallower.

  The control that bounds this is the same shape without the blank line, where the definition
  really is the item's at column two — there the lowered floor still applies. Eight probes with
  the intervening line, the blank, the separator width and the label indent varied independently.

  This trades two documents on Obsidian's root code-block ranges for five on its footnote
  positions: block counts shift in documents where an item previously kept a line across a blank
  and now does not.

- 3e4c8f4: A block identifier followed by a `]` run is now registered.

  `[[\[^1]` and `[\[^1]]]` register the block `1` in Obsidian. The identifier scan rejected
  any candidate whose tail was not an emphasis marker, so a closer run never reached the
  escaped-bracket gate written for exactly that shape.

- e74e9d4: Two block-identifier rules, from mining a third-party parser's test suite.

  An inline code span's closing backtick frees the caret, so `` `Line.`^blk `` registers
  `blk`. And four columns of indent is code, which holds no identifier.

- 6057219: A leading space keeps a block-identifier line prose.

  `^blk` alone is reported as no section at all, while ` ^blk` is reported as a paragraph.
  The space sits before the paragraph's start offset, so trimming the node's own text never
  saw it.

- 8dec52b: A block identifier inside a nested list item names that item.

  `- a` over `  - b ^id` registers the block against the inner item rather than the whole
  list.

- 6162351: A closing bracket after a block identifier must close a bracket that opened.

  `  ^blk](![[note]]` registers no block, where the identifier had been accepted on the
  strength of the `]` alone.

- 8ecbfaf: A block identifier in an inline wrapper is recognised whatever follows the wrapper.

  `*^blk* word` and `*^blk*, word` both register `blk` and render only their tail. The tail
  was restricted to punctuation, which was as far as the evidence went; probes now settle it.
  `x ^a_b` still registers nothing, because a closing marker has to have opened.

- 2900bfa: A block identifier inside an inline wrapper is recognised when punctuation follows.

  `*^blk*.` registers the block `blk` across the whole line in Obsidian and renders
  `<em></em>.`, exactly as `*^blk*` does. Both the text projection and the block scan stopped
  at the trailing `.`, so the identifier stayed in the text and no block was reported.

- 8d24e06: A blockquote absorbs a line opening a non-1 ordered marker.

  CommonMark lets an ordered item interrupt a paragraph only at 1, so `2.`, `10.` and `2)` open
  nothing and the line continues the quote. Micromark enforces that rule at root and not on the line
  after a blockquote; Obsidian enforces both, so this is a correction both of this package's targets
  want rather than a preset divergence:

  ```
  para / 2. x     stock  paragraph@0-1              the rule applied
  > q  / 2. x     stock  blockquote@0-0 + list@1-1  the rule skipped
  > q  / 2. x     obs    blockquote@0-1             absorbed
  ```

  Eight shapes match live 1.14.4 exactly, the five controls included — `1.`, a bullet, a
  blank-separated marker, a bare `2. x` and a marker inside the quote all keep stock behaviour.

  `legacy-block-quote.ts` vendors micromark's construct with one change, in the CONTINUATION: a quote
  that is already open claims a line whose first construct is a non-1 ordered marker. The marker's
  value is accumulated as a string rather than tested on its first digit, because `10.` begins with
  `1` and must still be absorbed.

  **The same rule as a list declining to open is not merely riskier, it is inert.** Instrumented at
  the decision point, every clause fired correctly and the construct was then attempted a second time
  with the quote already closed, so the list opened anyway: declining a container makes the document
  tokenizer close containers and retry, while only a container extending itself can claim a line.
  That attempt also tripped micromark's own `expected exit token to match current token` invariant,
  which is the same retry seen from the other side.

  Footnote agreement moves from 5994/6818 to 6010/6818 and Obsidian's code-block ranges from 826/883
  to 843/883. Three documents regress, all with a quote above a non-1 marker where Obsidian does not
  absorb, and they are recorded rather than narrowed for.

- 3079439: Close frontmatter on a `---` that carries a tail, and parse the tail.

  `micromark-extension-frontmatter` requires its closing fence to be alone on
  the line: anything after it fails the whole construct, so `---` / `a: b` /
  `---[^2]: x` arrived as a thematic break and the document lost its
  frontmatter entirely. Obsidian closes at the `---` and reads the rest of that
  line as ordinary Markdown.

  Absorbing the extension was considered and tested first — it is small, and the
  change looked like three lines in its `closeAfter` state. It does not work: a
  flow construct cannot legally stop mid-line, so returning `ok` there makes
  micromark discard the construct and fall back to a thematic break just the
  same. Making it legal would mean restructuring how that construct tokenizes
  its closing line, which is far more than the small patch the package's size
  suggests. This repairs the tree instead, the same shape as the other
  re-parsing passes here, and keeps the dependency unforked.

  One detail is measured: Obsidian's following block starts where the fence
  ends rather than where its content does, so `--- trailing` reports a paragraph
  of `" trailing"` including the space.

- 1c0a81d: Fold a footnote definition whose body spans several blocks, and rejoin the
  paragraph left beside it.

  A definition that cannot interrupt a paragraph is folded back into it, but
  only when its body was a single paragraph — anything else "has no unambiguous
  inline form", so it was left alone. Obsidian needs no inline form: the whole
  thing is prose to it. `prose` / `[^1]: lazy label` / `    ``` ` is one
  paragraph there, where the fence made our definition two blocks and blocked
  the fold. The source now goes back verbatim and the bare-reference pass
  reduces the label as usual.

  That exposed a second artefact. The fold reaches the fence line and the lazy
  line below stays behind as a second paragraph, separated from the first by a
  single newline — a shape no parse produces, since a blank line is what
  separates paragraphs. Rejoining such a pair is safe for the same reason it is
  needed: the state is unreachable from the parser, so nothing legitimate is
  merged.

  One corpus case, taking the corpus past 99%.

- 611fae3: Import the CommonMark spec's 652 examples into the parity corpus.

  The rest of the corpus was written alongside the parser, which makes it
  circular as evidence: it can only contain what someone thought to ask. The
  spec is the opposite — an externally authored, enumerable description of the
  base grammar, which is most of what a note actually contains.

  Their expected HTML is discarded. CommonMark is not the oracle here, Obsidian
  is, and it diverges on purpose in places this package documents. What the spec
  supplies is coverage of the input space, not the answer; every case is
  recorded against Obsidian like any other.

  575 of 651 match and 76 diverge, none of the previous 1531 regressed. Links
  account for 25 of the divergences, then HTML blocks, setext headings and list
  items. Code coverage of `src` is 96.6% of lines and 90% of branches, which is
  exactly the point: coverage was already high while the base grammar had 76
  unmeasured divergences, because coverage cannot see behaviour never written.

  The lossiness gate fired once and was wrong: it resolved escapes on both the
  source and the node value, and a value legitimately holding a backslash then a
  bracket looked like a dropped character.

- 70b0860: Make a heading of a one-line footnote definition under a setext underline.

  `[^1]: x` followed by `===` is a heading reading `[^1]: x` in Obsidian, not a
  definition. GFM gives the definition priority and swallows the underline as lazy
  continuation, or — for `---` — leaves a thematic break behind, so both shapes are
  recognised.

  The rule is narrower than it first looks, and the boundary is measured rather than
  assumed: only a **one-line** definition is swallowed whole. Given a continuation
  line the underline belongs to that line instead, so `[^1]: x` / `    y` / `--`
  stays a definition, and `[^1]: body` / `lazy` / `===` heads only `lazy`. The pass
  also has to run after the interrupt fold, or a definition about to be merged into
  the paragraph above it becomes a heading instead. Ignoring either constraint costs
  twelve cases that currently match.

  The heading keeps the raw line rather than the definition's parsed content,
  because the definition dropped `[^1]: ` as its label while Obsidian shows it; the
  bare-reference pass then reduces that to `1: `, and any reference pointing at the
  vanished definition is left to be orphaned. Six corpus cases.

- 27a709d: A callout line after a list continues the list.

  `- item` over `> [!note] title` is one list, where the callout used to open a block of its
  own.

- 3b8d4e7: A written-but-empty callout title displays nothing, where an absent one displays the type.

  `> [!note]` alone renders `Note`, the capitalised type; `> [!note]  ` with a trailing
  whitespace run renders nothing at all. The title gate keyed on the collected text after a
  `trim()`, which made the two indistinguishable.

- 95cd024: Keep the body under a callout whose title line is a block

  `titleLineIsBlock` reparses the title line only, and whatever followed it in the same
  paragraph went with the paragraph it replaced. `> [!note] # h` / `> body` lost `body`
  outright, as did the lazy, list, comment and definition forms — content loss on input
  anyone might write.

  A body in a _separate_ paragraph was dropped by a second, narrower bug: the sibling blocks
  were kept only when the lead text carried the newline, which is false exactly when a blank
  quote line separates them.

  The empty `calloutTitle` these create is now placed, zero-width at the title's own offset.
  An empty title is not an absent one, and an unplaced node is one a formatter cannot edit
  around.

- d964377: A callout's body paragraph no longer overlaps its title.

  The paragraph kept the start it had before the title was lifted out of it, so the two
  siblings overlapped by the title's whole width.

- 19c2b93: Keep indented code out of a callout, as it already was out of a plain quote. `> [!note] x`
  followed by a four-space line reports the callout and a separate root `code` block in
  Obsidian; the code was being absorbed into the callout instead. The lifting pass tested for
  `blockquote` only, and `calloutTransform` retypes the node two passes earlier.
- f7597a3: A title-less callout interrupted by an ordered marker no longer holds its line twice.

  `calloutTitleInterruptTransform` derives a list from the paragraph at `children[index]`, where
  `index` is 1 only when a title occupies `children[0]`. It wrote the result to `children[1]`
  unconditionally, so for a title-less callout the paragraph at `children[0]` survived and the
  list landed beside it:

      > [!note]
      > 2. [^1]: def

  reported `paragraph@2:3` and `list@2:3` as siblings starting at the same point, and the
  paragraph's `[^1]` was indexed as a surplus footnote reference Obsidian does not report.

      referee 6229 -> 6233 / 6818   +4 GAINED, 0 LOST

- 37cfa05: Only an ordered list that could not have interrupted is absorbed into a callout.

  `> [!note] title` over `- item` or `1. item` keeps its list, where previously any list after
  a callout title was folded in.

- 64e27a3: A callout marker's type may not span a line ending

  The type pattern was `[^\]]+`, which matches a newline — so an unclosed `[!` found its `]`
  on the next line and produced a callout whose type spanned both. `> [!n` over `note]` was
  a callout of type `n\nnote`, where Obsidian reads an unclosed marker as ordinary prose.

- b356d12: A callout now merges with the quote directly below it, as a blockquote already did.

  `> [!note] title` / `> # heading` / `lazy` / `> after` is one callout spanning all four lines
  in Obsidian. A heading ends the quote upstream, the unindented line becomes a root paragraph,
  and the marked line opens a second quote — so the two have to be put back together. That
  already happened for a plain blockquote and not for a callout, which arrives as its own node
  type, so the callout kept a stray second blockquote beside it.

  All four combinations were probed and the merged container always takes the first one's type.
  The two with a callout on the **right** are deliberately unchanged: merging moves the second
  container's children into the first, and a second callout brings its title with it, which
  would claim two titles where Obsidian renders one callout whose `[!tip]` line is body text.

- 1a4e32a: Keep a callout a callout when it holds a setext underline. `> [!note] title` followed by
  `> ---` or `> ===` was degrading to a plain blockquote, because micromark reads the marker
  line and the underline as one setext heading and the callout pass accepted only a paragraph
  as the quote's first child.
- a0da039: A callout title holding a block identifier renders empty.

  `> [!note] ^blk` registers the block `blk` and shows a title with nothing in it. The
  identifier scan hosted paragraphs and headings but not callout titles, so the `^blk` stayed
  in the title text.

- 413c785: Place a callout title that parses as a block

  When a callout's title line is a block rather than prose — a heading, a list, a
  definition — `titleLineIsBlock` reparses that line on its own and the result was spliced
  in unshifted. Every node kept offsets numbered from the line instead of the note.

  A wrong offset is worse than a missing one because it still looks usable, and this shows
  why: `> [!note] # h` was indexed as heading `1:> [`, the name sliced from the top of the
  document at offset 0 instead of the title at offset 10.

  Besides fixing the heading name, the positioned oracle's `footnotes` divergences drop
  from 46 to 43 and `listItems` from 69 to 68 — those reports were being corrupted by the
  same offsets.

- 41cb89c: Do not carry an inline construct across a callout's title boundary

  A construct spanning the title's line ending swallows the `break` the title/body split
  looks for, so no top-level break existed and the whole construct was taken as the title:
  `> [!note] *em` / `em*` reported one emphasis and an empty body.

  Obsidian forms no such construct — it reports the text `*em em*` with no emphasis — because
  the title ends at the line ending and the two markers then sit in different blocks. Each
  side is now reparsed on its own.

  A construct that fits on the title line is unaffected, and a quoted body is its own block
  and keeps its own.

- 2e91fdc: A callout title that is only an empty inline footnote is still a title.

  `> [!note] ^[]` shows the footnote as its title. The same footnote with content, `^[x]`,
  already worked — the gate read the title's collected _text_, and `^[]` collects to nothing,
  so the callout fell back to displaying the capitalised type.

- 91b8d83: An ordered item below a callout title opens a list whatever its start number.

  `> [!note] title` over `> 2. item` is now a list, where the `2.` had stayed text. A plain
  quote still keeps it as text, since a quote's first line is a paragraph.

- 0f6bbc5: Decide whether a callout title is a block from the source line

  The check read the first text node's value, but the inline tokenizer may already have
  taken part of the title into a sibling — and what is left can read as something it is
  not. `> [!note] ****strong**` leaves a lone `*` there; `*` alone parses as a list, so the
  title was declared a block and the `strong` holding the rest of it was dropped. Obsidian
  shows `**strong`, which our own emphasis had produced correctly before this discarded it.

  Now judged on the line as written, which is what the rule was always about.

  3 cases move from `replicate` to `match`, and three ceilings fall with it: `listItems`
  68 → 65 and `tags` 6 → 5, both inflated by the phantom list, and `callout > calloutTitle`
  11 → 8.

- 8cdda4c: A callout with no title closes its marker line as its own block, so an ordered item below it
  opens a list whatever its start number — the rule already applied to titled callouts. `> [!note]`
  over `> 2. [^1]: def` now reports the definition at column 5, where it had stayed paragraph text.
  A plain blockquote is unaffected, since its first line really is a paragraph.
- 995146d: Show an email autolink without its scheme.

  Obsidian renders `<mailto:a@e.test>` as `a@e.test`, and only `mailto:` is
  dropped — `<https://x>` keeps `https://`. The projection kept the scheme for
  both, which put 33 fuzz-reduced cases behind one wrong display string.

- f88751f: Leave an escaped footnote marker written as the author escaped it.

  `literal \[^9]` was being reduced to `literal 9`, deleting a marker someone had
  deliberately escaped. By the time a text node exists the backslash is gone, so
  `\[^9]` and `[^9]` have identical values and the reducer could not tell them
  apart.

  The pass now walks the source the node came from and records which characters
  arrived via an escape, skipping those. The walk is checked against the node's
  value and abandoned if it does not reproduce it — character references and
  anything else that rewrites text fall back to the old behaviour rather than
  trusting a bad alignment.

  One corpus case, and the failure mode it removes is the one that matters most
  for a formatter: silently rewriting text the author escaped on purpose.

- 65a85df: Fixes the parity harness's visible-text projection dropping a bare `<` run.

  The tag strip used `<[^>]*>`, which ate `<]]>`. A browser only opens a tag on `<` plus a
  letter, `/`, `!` or `?`, so `<![CDATA[>&<]]>` renders `&<]]>` -- the rule the comment
  beside it already stated. No parse change: micromark and the arbiter agree on the node.

- 3400da0: A wikilink is no longer mistaken for a task checkbox.

  `1. [[]]` reports the plain list marker, where the checkbox scan had captured `[` out of
  the wikilink's brackets.

- 56a28ed: Fix six catastrophically-backtracking regexes, and gate against more.

  `eslint-plugin-redos` (recheck, real automaton analysis rather than the
  star-height heuristic most linters use) found eleven vulnerable patterns, six
  of them in shipped code that parses untrusted vault notes. All were polynomial
  rather than exponential, but polynomial is enough:

  - `/\s+$/` twice, the classic quadratic trailing scan — every start position
    consumes the whole run before failing at `$`. Both are now `trimEnd`.
  - `[ \t]*>?[ \t]*` in the setext underline, and `[ \t]*\|?[ \t]*$` in both
    table delimiter patterns, where a whitespace run can split between the two
    stars in every position. The optional marker now absorbs its own spacing.
  - A footnote label scan that could run to end of document, bounded to the line
    it can actually occupy.

  The lint is scoped to `src`, which is the whole threat model: the harness runs
  only against the committed corpus.

- e49ace5: A closing `</pre>` now interrupts a paragraph, as it does in Obsidian.

  micromark keeps `pre` only in its raw-tag list, which governs opening tags, so a bare
  `</pre>` lands on a block type that refuses to interrupt. Obsidian's parser carries `pre`
  in its block-tag list. Narrow by measurement: `</script>`, `</style>` and `</textarea>`
  stay absorbed, as the arbiter says they should.

  Both html block-tag differences now sit behind the new `legacyHtmlBlocks` option, on by
  default.

- b977ed4: Three fixes from cases recorded against other implementations' suites.

  A delimiter row may be colons with no dashes, so `|a|` over `|::|` is a centred table. A
  callout marker must sit on the blockquote's own first line, so `>` over `> [!note]` is a
  plain blockquote. And an html comment inside a list item keeps the rest of its line.

- 6ec999d: A link, embed or tag inside a `%%` comment is now indexed.

  `%%[[target]]%%` is reported as a link by Obsidian — a comment hides its body when
  rendering but still indexes what is inside it — and the projection skipped comment bodies
  entirely.

- 3027388: A footnote definition freed by a comment closer starts one past that closer.

  `> %%` over `> hidden` over `> %% [^1]: freed` starts the definition at column 4 rather
  than at its bracket.

- fbe2fd1: A block comment's closer is the first `%%` on its closing line.

  `commentTailTransform` found the closer with `lastIndexOf("%%")` over the whole comment, which
  agrees whenever the closing line holds one `%%` and silently declines when it holds two — the tail
  is then empty, so the split never happens:

  ```
  %%
  x
  %% culpa ex %%
  [^1]: def
  ```

  Obsidian closes at the first `%%` of line 3, leaving ` culpa ex %%` as a paragraph that takes lazy
  lines, so the label below is lazy text and not a definition. We read the line as a complete inline
  pair and defined it.

  Searching from the last line ending keeps the opener out of reach, so a single-line `%% a %%` still
  lands on offset 0 and is still declined by the existing guard. Six probes against live Obsidian now
  agree where five did before.

  Footnote agreement moves from 6013/6818 to 6015/6818 with zero regressions, verified by comparing
  the agreeing sets by identity. The gain is two documents rather than the twenty-one carrying the
  shape, because those also diverge elsewhere; what the change buys is the rule being right.

- 36e93f7: A footnote definition buried inside a `%%` comment now starts at its label rather than at the
  start of its line, so the reference Obsidian indexes in its place has the right column.
  `- %%` over an indented `[^1]: def` reports the label at column 2; it had reported column 0,
  which was only ever right when the label happened to sit there.
- 0e52a65: Fixes a formatter loop that grew a file without bound on every pass.

  A `%%` inside a footnote definition was folded back into its paragraph as one text node
  holding the raw source, container indent included. The definition handler then indented
  that value again, the doubled run's leading space was encoded as `&#x20;`, and its `&` was
  escaped on the pass after -- four columns and a backslash run per round, forever. A
  48-byte definition reached 12kB in eleven passes.

  Now split per line with exact spans, so offsets stay correct: six of the thirteen
  non-converging round-trip cases are fixed, with no parity change.

- f0c5083: A paragraph that absorbs a comment's lines now covers them.

  Folding a `%%` back into a footnote definition's paragraph extended the definition's span
  and left the paragraph's own end behind, so its children reached past it.

- 1cd005d: A `%%` comment folded back into a footnote definition resolves its escapes.

  The fold took the comment's raw source as the text node's value, so `\[\[target]]` kept
  its backslashes, `remark-stringify` escaped them again on the way out, and the run doubled
  on every format pass. Resolving them is what a text node for that span would have held
  anyway, so re-escaping is now idempotent -- and the output is byte-identical to bare
  remark's for the same input.

- b1613b0: A `%%` comment opener indented four or more columns is indented code and opens nothing, so the
  definitions below it are no longer swallowed. `> x` over a six-space `%%` and a `[^1]: def` now
  reports the definition, where the comment had run to the end of the note. A tab reaches the
  threshold, and an opener that continues a footnote definition keeps working, since a
  definition's own content already sits at four columns.
- 089b969: Lift a column-zero `%%` out of the container above it. `- item` / `text` / `%%` and
  `> quote` / `%%` report two root sections in Obsidian, with the comment running to the end of
  the note; the comment was left a direct child of the `listItem` or `blockquote` with its
  extent stopping at the container's end. The swallowed content becomes the comment's children,
  so every reference stays in the tree. Fixes 16 three-element and pair compositions.
- 0ddfd89: Absorb an HTML line as lazy continuation into a list or blockquote

  Obsidian does not let an HTML block interrupt a paragraph inside a container, so
  `- x` followed by `</div>` is a single list. We ended the list and started an HTML
  block, reporting a stray section Obsidian has no equivalent for.

  The legacy stack draws the boundary sharply, and it is the container that matters
  rather than the construct:

  | source            | blocks                                           |
  | ----------------- | ------------------------------------------------ |
  | `- x` `</div>`    | one `list`                                       |
  | `para` `</div>`   | `paragraph` and `html` — html interrupts at root |
  | `- x` `` `</div>` | `list` then `html` — the blank line ends it      |

  5 cases move from `replicate` to `match` with no regression.

- b2760df: A list absorbs a following indented-code line and whatever it was hiding.

  `1. p` over `  10.     q` over a tab-indented `%%` over `[^1]: def` is now one list, where
  the code node used to break the chain and expose the definition.

- fe4df00: A container absorbs a following quote or list line as lazy continuation.

  `- a` over a blank over `  [^1]: def` over `> quote` is one list, and an ordered item below
  a callout title now nests inside the callout.

- 1c79e91: Place a container setext heading's children, and keep what follows the underline

  `containerSetextTransform` left its reparsed children numbered from the fragment. That is
  worse than it looks: `contentStart` in `setext-underline.ts` deliberately trusts a
  heading's children over its own span, so an unshifted child reported offset 0, that pass
  read the whole document as the heading's content, counted three lines and demoted the
  heading it had just been handed. `- a` / `- b` / `===` lost its heading and came back as a
  paragraph spanning the entire source.

  The underline also has to be the _second_ line rather than the paragraph being two lines
  long. `- item` / `===` / `more` is a heading plus `more`, while a run on the fourth line is
  not an underline at all — capping the block conflated the two.

- fb7b881: A footnote definition inside a list item absorbs a following unclosed `$$` line, so the
  definition ends on that line as Obsidian reports it. `- [^a]: Definition` over an indented `$$`
  now spans both lines, at every indent including column zero; the `$$` had been a separate math
  block and the definition ended one line early. A closed `$$` region stays its own block, and a definition at the root is unaffected.
- dd73dce: A bare `[^1]:` absorbs nothing.

  `[^1]:` over `x` is a definition and a separate paragraph, where `[^1]: ` with a trailing
  space is one definition holding `x`. `definitionLazyTransform` absorbed both.

- 758ffa3: A link reference definition's title may start after a blank line, as Obsidian reads it.
  `[foo]: /url` followed by a blank line and `'the title'` is one definition carrying that title,
  so a footnote reference inside the title is dead; it had been a separate paragraph with a live
  reference. The title text is preserved on the node, so a formatter does not drop it.
- 210a0a2: A footnote definition in a list item takes the content column only when it clears it by two.

  `1. item` over `    [^1]: def` starts at the bracket, where `- item` over `    [^1]: def`
  starts at the item's content column.

- 803c699: A nested footnote definition takes its innermost list item's content column.

  `- a` over `  - b` over a blank line over `    [^1]: def` now reports column 4 rather than
  the outer item's 2.

- d353866: A link reference definition's start column follows the same rule as a footnote definition's.

  `   [foo]: /url` at root reports column 0, and one inside a list item reports the item's
  content column.

- 5012ffe: A definition's column under a list item whose marker is followed by five or more spaces now
  falls back to the marker plus one separator, as Obsidian reports it. `*` with nine spaces over
  a four-space-indented `[^1]: def` is column 2, not 4, because that much indentation is the
  item's own indented code rather than a wider content column.
- ff51ac7: A footnote definition now starts at its containing block's content column.

  Obsidian reports the start of the block rather than the position of the `[`, with the
  indentation in between belonging to the definition: ` [^1]: def` starts at column 0, and
  `- a` over `    [^1]: x` starts at column 2 — the item's content column, not the bracket at 4. Closes 11 of the 17 positional divergences on footnote definitions and moves the
  independent referee corpus from 67.5% to 70.8% agreement.

- 830de73: A blank line ends a footnote definition, even with an unclosed `%%` inside it

  The comment is bounded by the definition and the definition by its blank line, so
  an opener with no closer reaches the definition's end and no further:

  ```
  [^1]: one          the definition ends on the `%%` line, and
  %%                 `use[^1]` below the blank is a live reference

  use[^1]
  ```

  Five probes recorded against Obsidian 1.14.4 settle it, including the case that
  must not change: `[^1]: one` / `%%` / `b` has no blank, so `b` continues the
  definition lazily and the `%%` does not end it.

  Scoped to a definition deliberately. The same rule stated globally is wrong — at
  the top level an unclosed `%%` runs to the end of the note, blank lines and all,
  which a committed golden pins. Only a container that is itself blank-line
  terminated bounds the comment this way.

- 3a21003: A `%%` comment does not end a footnote definition.

  `remark-footnotes@2` builds its interruptor list out of `remark-parse@8`'s own block methods
  (`index.js:54-68`), so a construct rp8 never had cannot appear in that list and cannot interrupt a
  definition. Our `%%` comment construct sits in `constructs.flow`, and the definition's block probe
  asked the whole map — handing it an interrupting power rp8 does not give it:

      [^1]: body text / ⇥$$ / ␣␣%%        obs spans 3->5, we stopped at 4

  `$$` math is deliberately NOT covered, and that is measured rather than assumed. The same
  reasoning applies to it word for word — rp8 has no math either — yet excluding it costs 55
  documents against 6 gained. Obsidian's math fence really does end a definition. Priced three
  ways:

      commentFlow + mathFlow    +15 / -55
      mathFlow alone             +6 / -55     <- the whole loss is math
      commentFlow alone          +9 /   0     <- shipped

  The filter is a deny list of rp8's absentees rather than an allow list of its methods, so that a
  construct replaced under a new name keeps working: `legacyCodeFenced` is exactly such a
  replacement, and rp8 does have fenced code, so it must keep interrupting.

      referee 6199 -> 6208 / 6818   +9 GAINED, 0 LOST, by --ids identity
      main parity gate green, 450 tests pass, 0 probes drifted, 4 gates green

- 458d3bd: A footnote definition under a list item takes the item's full content column.

  `-   p` over `     [^1]: def` starts at column 4, and a tab in the definition's own indent
  puts it just past that tab.

- 20a1452: A block absorbed into a footnote definition joins its trailing list item.

  `[^1]: -` over `y^2$` puts the paragraph inside the empty list item rather than beside it.

- f11d019: A footnote definition continues onto a lazy line, as `remark-footnotes@2` does.

  Stock gfm keeps a definition open only on a blank line or an indent of exactly four columns.
  `remark-footnotes@2.0.0/index.js:172-223` — the parser Obsidian's fork descends from — is more
  permissive, and its loop reduces to one sentence:

  > A line continues the definition unless it is indented fewer than four columns AND either the
  > previous line was blank or it starts a new block.

  So an unindented paragraph line continues it, while an unindented heading, fence, quote, list,
  table or definition ends it, and after a blank line any unindented line ends it. The interrupt set
  at `index.js:54-68` is "every block method except `newline`, `indentedCode`, `paragraph` and
  `footnoteDefinition`", with `footnoteDefinition` appended.

  CROSS-VALIDATED before implementing. `definition-trim.ts` carries a table measured from the
  referee corpus in an earlier session with no knowledge of that source — definition 11 end/0
  absorb, heading 4/0, fence 4/0, thematic 1/0, plain TEXT 5 end/27 absorb. Block openers interrupt,
  plain text is lazy continuation. Two independent derivations, one rule.

  Four things are load-bearing, each measured:

  - The indent arm is attempted FIRST, because four columns or more continues regardless of a
    preceding blank (rp8 expands a tab to its stop, so one leading tab is four columns).
  - `self.containerState` is saved and restored around the block test. Container constructs WRITE
    into it, so testing an interruption with the definition's own live state object corrupts it;
    `document.js:153` resets it for exactly this reason. Without this: 0 gained, 1172 lost.
  - `self.interrupt` is set to `undefined`, not `true`. With `true`, `list.js:81` admits only `1.`,
    so other markers stop interrupting and definitions swallow them.
  - A bare `[^1]:` absorbs nothing, which falls out of rp8's own loop: its content scan starts past
    the label, so a bare opener's first line has `contentStart === contentEnd`.

  `definitionAbsorbedItemTransform` completes the half the tokenizer pre-empts. `definitionLazy`
  nests a SIBLING paragraph into a trailing list item — `fuzz/footnote/18` (`[^1]: -` / `y^2$`)
  reports `listItems` spanning `0:6-1:4`, which only holds if the paragraph sits inside the empty
  item. Once the continuation absorbs that line itself there is no sibling left, so the new pass
  nests an already-absorbed trailing paragraph instead.

      referee 6163 -> 6170 / 6818   +12 GAINED, 5 LOST, by --ids identity
      main parity gate green, positioned-oracle ceiling unchanged at 18
      450 tests pass, 4 gates green
      the recorded fence-in-definition reproducer now AGREES with Obsidian

- fc33853: A list item's de-indentation minimum moves where its indented code begins, not just where its
  definitions start, so a label four or more characters past the lowered content column is code
  and defines nothing. `- a` over a one-space continuation and a five-space `[^1]: x` now yields
  no definition, matching Obsidian; it had produced one at the lowered column. A tab counts as
  one character here and a tab following a space counts as nothing, which is the same asymmetry
  the definition column already applied.
- 5cda29f: A footnote definition now ends before a following label at column zero, rather than absorbing
  it as lazy continuation. An indented label is still the definition's own content, so only a
  line starting a block of its own ends it.
- 0df87ba: A footnote definition ends at its last content character.

  `> [^9]: stray` / `> [^a]: kept` ends the first definition at the end of its own line
  rather than carrying it into the next one.

- da67fa7: A footnote definition ending at the start of a line now ends on the previous one.

  Its span had been one line long, holding only the preceding line's ending. A definition that
  opened a `%%` or `<!--` region keeps its old end, since there the line is its own closer.

- ee8dc20: A footnote definition no longer absorbs the paragraph after a blank line it had swallowed.

  `definitionLazyTransform` takes the line below a definition into it, which is right: lazy
  continuation needs an open paragraph and a bare `[^1]:` or `[^1]: >` leaves none, so micromark
  ends the definition where Obsidian keeps it open. The pass guards that with "only a block with
  no blank line before it", spelled as

      source.slice(definitionEnd, from) !== "\n"

  and that guard is DEFEATED BY ITS OWN PREMISE. A definition holding an indented block runs
  through the blank line that follows it, so the blank is INSIDE the definition's span and the gap
  to the next block really is a single newline:

      [^a]: def / ⟨4sp⟩``` / blank / after [^b]      arrives as footnoteDefinition@0..2,
                                                     where line 2 IS the blank

  So the rule was satisfied by a blank line that had been absorbed rather than by its absence, and
  the following paragraph -- with any reference in it -- was pulled into the definition. Obsidian
  ends the definition at its content: `broad-20261004.json#13` has `ch2*` spanning 15..16 where we
  ran to 18.

  Fixed by also requiring the definition's OWN END LINE to be non-blank, which is the thing the
  gap test cannot see. Not tab-specific: the four-space form behaved identically, and bare
  `remark-parse` + `remark-gfm` get both right, so this was ours in BOTH presets rather than a
  tokenizer or legacy-flag divergence.

  Found by classifying every diverging document by WHICH OF OUR NODES covers the first diverging
  fact -- the mechanism axis rather than the input shape. 669 divergences concentrate into five
  buckets covering 86%, and `MISSING inside our footnoteDefinition` was the largest at 260.

      referee 6148 -> 6158 / 6818   +10 GAINED, 0 LOST, by --ids identity
      3 probe-ledger entries NOW AGREE with Obsidian, 0 moved away
      450 tests pass, 4 gates green

- 8afe256: A footnote definition absorbed into another footnote definition takes its host's content column
  of four rather than being reported at column zero. `[^a]: def` over a blank line and an indented
  `[^b]: body` now reports `[^b]` at its bracket where the indent is under four, and at four
  beyond that, matching Obsidian; it had been reported at zero regardless.
- bf6e354: An indented line after a link reference definition is indented code, not a paragraph.
  `[ref]: /url` followed by a four-space line reports `definition` then `code` in Obsidian; a
  definition is a closed block, so CommonMark's "indented code cannot interrupt a paragraph"
  rule does not apply to it. Scoped to link definitions: a footnote definition's indented line
  is its own content and is untouched.
- e6c5c2b: Nothing ends a footnote definition more than 1024 characters into it.

  A heading, fence, list item or label starting at or past that point is ordinary text of the
  definition, as `remark-footnotes@2` and Obsidian both read it.

- 1d034a8: A footnote definition a callout absorbs lazily keeps only its own line, so the indented line
  under it becomes a root code block as Obsidian reports it. `> [!note] title` / `[^1]: def` /
  `    code` gave one callout spanning all three lines; it is now the callout, a root `code`,
  and a definition ending on its own line.
- 1701543: A non-1 ordered marker does not end a footnote definition.

  `list.js:81` is `!self.interrupt || code === codes.digit1`: only `1.` may interrupt a paragraph,
  and only when the interrupt flag is set. The definition's block probe runs with `self.interrupt`
  undefined — which it must, since setting it for the whole construct map interrupts nearly
  everywhere — so every marker opened a list there and ended the definition. Obsidian keeps the
  line:

      [^ch2*]: def / 10. [^2]: Prose here     obs REFERENCES "2", we DEFINED it

  HOW IT WAS FOUND. Classifying the `def-extra` + `ref-miss` pair BY POSITION rather than by name
  gives 73 documents that are a pure swap — same name, same line, same column, we report a
  definition where Obsidian reports a reference. Of those, 66 have the name defined nowhere, and
  after excluding the 20 covered by a `%%` region, 39 of the remaining 46 have NO blank line before
  the definition, so the line should continue it. 14 of those open with a non-1 ordered marker.

  `orderedMarkerNotOne` is `legacy-block-quote.ts`'s own construct, already measured there for the
  rule that a blockquote ABSORBS such a line — the same fact from the other side, so this reuses a
  measured construct rather than adding arithmetic.

  The scoping is what makes it work, and the alternatives are priced: setting `self.interrupt` for
  the whole flow map cost 41 documents with zero gained, because that map also holds `content` and
  `codeIndented`, the two constructs rp8's interruptor list explicitly excludes; restricting the
  flagged probe to `codeFenced`, `htmlFlow` and `setextUnderline` cost 292, because
  `setextUnderline` cannot be attempted standalone. Excluding one construct from the unflagged
  probe reaches the same documents without disturbing the rest.

      referee 6170 -> 6199 / 6818   +32 GAINED, 3 LOST, by --ids identity
      main parity gate green, 450 tests pass, 0 probes drifted, 4 gates green

- 5385436: A setext underline under a link reference definition is recognised in its `---` form as well
  as its `===` form. `[ref]: /url` over `---` is an `<h2>` reading `[ref]: /url` in Obsidian
  with no definition created, which the existing pass already reproduced for `===` but declined
  for `---`, where micromark builds a `thematicBreak` rather than paragraph text.
- 6d08a3c: A setext underline directly under a definition heads that line.

  `[foo]: /url` over `===` is an `<h1>` reading `[foo]: /url` and creates **no** definition,
  so the `[foo]` below renders as literal text. micromark consumes the definition first,
  leaving the `===` with nothing to underline. The rule turns on adjacency: with a line
  between, the definition survives and only that line heads.

- c258c8e: A footnote label indented by a TAB directly after a quote's prefix no longer defines.

  `> ` followed by a tab and `[^1]: def` is indented code in Obsidian, so nothing is defined
  there. One, two or three spaces then a tab still define, and four spaces already defined
  nothing on both sides — the asymmetry this package encodes at line start, now applied relative
  to the quote's own content column.

  Referee agreement 5812 to 5823 of 6818 documents, the code-range dimension unchanged at 742 of
  883, and no corpus regressions.

- 706ad21: A footnote label indented by a TAB past a list item's content column no longer defines.

  `- p`, a blank line, then two spaces, a tab and `[^1]: def` is indented code in Obsidian, so
  nothing is defined there. One, two or three spaces then a tab still define, and four spaces
  already defined nothing on both sides — the same asymmetry already applied to a quote's prefix,
  now measured against an item's content column.

  Referee agreement 5823 to 5827 of 6818 documents, the code-range dimension unchanged at 742 of
  883, and no corpus regressions.

- ba3874a: A footnote definition takes a trailing whitespace-only line into its span.

  `[^1]:` over six spaces is one `footnoteDefinition` covering both lines, and so is
  `[^1]: b` over six spaces — a body makes no difference. A whitespace-only line followed by
  content does not extend it, and neither does a truly empty line.

- c40969a: A footnote definition does not end on a blank line

  Where a definition's body ends in an unclosed opener — an indented fence, an
  indented `$$` — micromark lets that construct consume the blank line after it,
  because indented code and an unclosed fence may legitimately contain blanks. The
  definition's span grows by one line as a result. `remark-parse@8` stops at the last
  line that holds something, and Obsidian parses with `remark-parse@8`:

  ````
  [^1]: body            lines 0..1 to Obsidian, 0..2 to micromark
      ```
                        <- the blank micromark takes in
  next
  ````

  Measured against the legacy stack across four shapes, each exactly one line out.
  Only the definition's own end point moves; its children already end where they
  end, and the blank was never any node's content.

- d4bc9f5: The definition-trim pass derives its columns from offsets.

  Both of its column reads are branches, so a stale column from an earlier offset-only move
  could not be repaired downstream. Currently behaviour-neutral; the defect was latent.

- b654642: A footnote definition no longer ends on a blank line when the line that follows it holds
  content. The trim already existed but applied once: its blank-line loop declines when the end
  sits on a content line, and the column fallback then pulls the end back one line, exposing
  blanks the loop never examined. Re-testing after the fallback closes 36 referee documents.
- c43a55e: An ender past a definition's 1,024-character window must _fit_ in it, not merely begin in it.

  `remark-footnotes@2` looks for something that could end a definition only within its first 1,024
  characters, and Obsidian inherits that. `definitionWindowTransform` tested where the ender _starts_;
  the window truncates the text, so an ender is recognised only if what survives still reads as one.
  Measured against live Obsidian with the ender's start offset across the boundary:

  ```
  ender    1000  1020  1023  1024  1025     (0 = ender ends it, 1 = lazy text)
  heading     0     0     0     1     1     `#` alone is still a heading
  item        0     0     0     1     1     `-` alone is still an item
  fence       0     0     1     1     1     one backtick is NOT a fence
  label       0     1     1     1     1     `[^2]` without its colon is no label
  ```

  So the threshold is per-ender: one character for a heading, an item or a quote, three for a fence or
  a thematic break. The rules document states the same boundaries from the other side — _"a label at
  character 1,020 no longer fits, nor a fence at 1,022"_.

  The **label** boundary is deliberately not taken. Absorbing a definition into a definition inverts
  the inner span: `[^1]: ` + 1013 characters + `\n[^2]: x` produced `footnoteDefinition off 1020-1019`,
  an end before its start, because the pass copies the absorbed block's end onto the host and a
  sibling definition's end is already the host's. Its five probe rows still diverge and say so.

  Footnote agreement moves from 6028/6818 to 6029/6818 with zero regressions, verified by identity;
  the probe table goes from 6 diverging cells to 5.

- 36a503c: Make a run of inline-footnote openers linear instead of quadratic.

  Every `^[` scanned forward for a balanced `]`, so a run of openers with no
  `]` anywhere cost one full scan each: `^[` repeated twenty thousand times
  took 21 seconds where the bare chain took 160ms. A 40KB note anyone can type
  wedged the parser.

  The document now remembers the point past which no `]` remains, and openers
  after it fail immediately. **20000 openers: 21s → 148ms**, and the curve is
  linear.

  The recorded fact is deliberately "no `]` remains from here" rather than "this
  attempt failed". The weaker condition would be unsound for a scanner that
  counts bracket depth: `^[^[ ]` exhausts the input from the first caret,
  because the inner `[` raises a depth one `]` cannot clear, yet a scan from the
  second caret has a closer available — so a failure says nothing about later
  positions, while the absence of any `]` does.

  Behaviour is unchanged: identical output before and after, parity holds at
  2070 of 2211, and no pinned case drifted.

  `highlight-run` remains quadratic and is a different problem. A run of `=` is
  full of `==` pairs, so every attempt _finds_ a closer and the cost is the
  chunk scan reading to end of input before it can judge itself — that needs the
  scan to stop at the decision point, which is a restructure of the legacy port
  rather than a memo.

- 93a018b: A wikilink's display keeps the path's written whitespace.

  `![[*\u00a0*]]` resolves to a target with a plain space while displaying the no-break space
  the author typed.

- 1abf266: No separator after inline display math on its own line.

  `$$y^2$$` over `word` reads `⟨math⟩word` in Obsidian, with no separator, where every other
  line ending in a paragraph reads as one — the rendered formula is a block-level element, so
  the `<br>` beside it contributes nothing to `textContent`.

- a86c9af: A `[^` before an inline footnote's `^[` is a reference opener and wins.

  `[^[^1]` is a footnote reference whose label runs to the first `]`, so the label is `[^1`
  and renders bare. We built an inline footnote, because `^[` opens one and our construct
  saw that `^` first. Done as a repair, since declining `^[` after a `[` in the tokenizer
  is already refuted -- it lets the wikilink win instead.

- 581262b: With a repeated block identifier, the last one wins.

  `x ^b` / blank / `y ^b` registers only the second, matching the rule already measured for
  a duplicate footnote definition.

- 480525f: Only the last definition for a label is rendered, and an inline footnote inside a skipped
  one still is.

  The recorded html shows both: `[^1]: > [!note] ![[[[word]]]]` over `[^1]: - [^1]` renders
  the _second_ definition, so the first one's embed is never indexed; and
  `[^1]: - ![[[[a|b]]]]](^[[[a#h]]]`, referenced nowhere, still indexes the `a#h` inside its
  inline footnote because an inline footnote is self-referencing and gets relocated.

- 0777523: Frontmatter with a duplicate key reports no position.

  `footnote-prefix: 2.` over `footnote-prefix: 3.` yields no frontmatter position, as
  Obsidian's own cache does.

- da5af37: Make a footnote reference inside `^[...]` inert, and count the ones inside `%%`.

  Two rules from the Footnotes Shortcuts author's list, both confirmed against
  recorded goldens, and both invisible until the `metadataCache` oracle was
  turned on.

  GFM binds `[^1]` to its definition wherever it sits, so `^[see [^1]]` arrived
  holding a live reference. Obsidian records none for that document, and the
  inline note renders as a single marker. The node becomes the text it was
  written as, which loses nothing. Only footnote constructs are demoted —
  whether emphasis inside an inline note is also inert has no case behind it
  yet, so it is left alone.

  Conversely Obsidian _does_ index a reference written inside a `%%` comment,
  even though nothing renders it. Our tree keeps a comment as one opaque value,
  so the metadata projection reads references out of it rather than walking for
  them.

  Eleven cases move to matching: the two from the list, plus nine already in
  the backlog that shared the comment cause.

- a31281b: A partly-consumed tab no longer leaks its remaining width into a list item's content.

  The preprocessor turns one tab into a single tab code followed by virtual spaces filling to the
  next stop, and a container's indent is consumed by code count rather than by column. So an item
  whose content column is two takes the tab and one space, leaving three virtual spaces for the
  flow to read as indentation — enough, with a following real space, to make the line indented
  code.

  `-` over a blank over tab-two-spaces `[^1]: def` is a definition at column 1 in Obsidian, and
  was being swallowed by a code block. Consuming the pending virtual spaces once the item's own
  indent is satisfied fixes it.

  This closes `probe/item-tab-threshold/tab-three`, a case recorded as a known gap when the tab
  family was first explored, and lowers two compute ceilings by one.

- 31a8c95: `fuzz/embed/64` is embed resolution, not parsing, and is re-triaged out of the backlog.
  The `![[ ]]` target collapses to empty, Obsidian resolves it to the current note and
  embeds the note into itself six levels deep, so one `$**strong**$` is read six times.
  Reproducing that needs a vault and recursive inlining, which the renderer owns.
- e786fc9: An embed's display text is now the alt as written, not as rendered.

  `![foo [bar](u)](v)` displays `foo [bar](u)` in Obsidian's cache, where mdast's flattened
  `alt` gives `foo bar`. Sliced from the source instead.

- eb701e3: An embed's bracket does not free a block identifier.

  `![[\[^1]]]` registers no block, where the link form `[[\[^1]` still registers `1`.

- 59514de: `_` closes inside a non-ASCII word, because legacy's word test is ASCII-only.

  `_пристаням_стремятся` renders `<em>пристаням</em>стремятся` in Obsidian where `_foo_bar`
  stays literal. `remark-parse@8` delegates the word check to `is-word-character`, which is
  `/\w/` and nothing more, so no non-ASCII script counts. The port had `\u0080-\uFFFF` added
  to the class, which inverted the rule for every such script.

- 9cc9333: Legacy emphasis no longer closes on a delimiter inside a footnote label.

  A GFM footnote call requires its name to be defined, so an _undefined_ `[^ch2*]` is not a call at
  all — it stays literal text, and `bareFootnoteRefs` recognises it afterwards. That works until the
  name contains an emphasis delimiter. `Opening [^ch2*] and [^ch2*]` had the `*` of the first label
  pair with the `*` of the second:

  ```
  text("Opening [^ch2")  emphasis  text("] and [^ch2")  text("]")
  ```

  destroying both references, where Obsidian reports both. The same happened with `_` in a name.

  Only the _closer_ is tested, which is what makes the rule expressible: the construct is entered at
  the marker and its scan materialises only forward, so whether the opener sits inside a label is
  not knowable — but it does not need to be. The closer of a cross-label pair is always inside the
  second label, which is in the scanned slice. Emphasis that legitimately spans a label is
  unaffected: `*a [^x] b*` and `**a [^y*] b**` still form, because their closers are outside any
  label.

  Differential harness: 6116 → 6131 of 6818 documents with no regressions, references 97.96% →
  98.10%.

- ccbf3e2: An empty list item is no longer closed by a further blank line, and a tab-indented line below
  one belongs to the item rather than to the document.

  CommonMark says a list item "can begin with at most one blank line", so `-` followed by a blank
  ends the list and an indented line after it becomes a top-level code block. Obsidian inherits
  `remark-parse@8`, which keeps the item open: `-` / blank / tab + `[^1]: def` reports a footnote
  definition at column 1, where this package reported indented code and no definition at all.

  Two halves that are useless apart. The item has to survive the blank line, and the tab-indented
  line then has to be accepted as its content with a content column of 1 -- measured identical
  across `-`, `- `, `10.` and `10. `, so the marker's width does not enter into it.

  The line must still REACH the item's content column: `-    p` or `100. a` put that column past
  the tab stop, and a tab-indented line below those is genuinely top-level code on both sides.

  Referee agreement 5762 to 5767 of 6818 documents, the code-range dimension unchanged at 742 of
  883, and no corpus regressions.

- e13db18: An empty link label no longer takes a footnote reference as its reference.

  `[text][][^1]` has three brackets. The `[]` is the collapsed marker of `[text]`, so `[^1]` stands
  alone and Obsidian indexes it as a footnote reference. We read the `[]` as a label in its own
  right and took `[^1]` as its reference, producing one `linkReference` over both and losing the
  footnote entirely.

  The test is on the characters, not the tree: at this point `[^1]` is still text, and the node that
  would answer a tree query is created by a later pass which only runs because these characters were
  left alone.

  Scoped to an _empty_ label, which is what separates the two readings:

  ```
  see [text][][^1]     ref `1` — `[]` is a collapsed marker, `[^1]` is free
  a [text][^9] b       no footnote — a non-empty label does take `[^9]` as its reference,
                       forming a link to an undefined label that renders as literal text
  ```

  Differential harness: 6131 → 6133 of 6818 documents with no regressions, references 98.10% →
  98.12%.

- b0cf92f: Extend a list over an indented block after a blank line

  CommonMark says an empty list item takes no further content — cmark's own example 280
  reads `-` / blank / `  foo` as a list _and_ a paragraph. Obsidian reads one list, and the
  same holds at an ordered marker's wider content column and across a second blank line.

  The block is re-parsed dedented by the item's content column, so `    foo` under a nested
  item becomes the paragraph it is inside the item rather than the indented code block it
  looked like at root.

  Only a trailing item that is empty: an item already carrying content needs nothing, and a
  blockquote is genuinely two blocks.

- 684b72f: A wikilink whose inner starts with a pipe displays that inner verbatim.

  `[[|b]]` displays `|b`, where a leading pipe had been read as an alias separator and the
  display came out empty.

- 4cf31c6: An entirely empty wikilink keeps its space when serialised.

  `[[ ]]` was written back as `[[]]`, which does not parse as a wikilink at all, so a second
  formatting pass read plain text and escaped it to `\[\[]]` — growing again on every run.
  Five corpus documents never converged on this.

- 7d483ef: Resolve character references when aligning a text node to its source

  `bareFootnoteRefTransform` aligns a text node's value against its source slice so a
  spliced reference can carry both a position and the label as written. That alignment
  modelled escapes only, so a value holding a resolved entity could never match: `[^&amp;]`
  reaches the node as `[^&]`, the rebuilt string stayed `[^&amp;]`, and the alignment
  returned `null`.

  Everything downstream then degraded silently — the references and surrounding text were
  spliced with no position, and the label lost its written form.

  2 cases move from `replicate` to `match`, positionless nodes 52 → 49, and three ceiling
  entries fall with `heading > text` reaching zero. A stale lossiness exception for one of
  them is gone too.

- f0518b5: A block identifier behind an escaped bracket is found when a wrapper precedes it, so
  `*x* \[^1` renders `x [`. The host walk gated on the whitespace-anchored pattern alone and
  stepped past its own host into the emphasis.
- d541a42: An escaped bracket no longer hides a block identifier.

  `\[^1` leaves a literal `[` with the caret free behind it, so the trailing `^1` is an
  ordinary block identifier -- Obsidian registers it and renders only `[`. An _unescaped_
  `[^1` opens a footnote reference that claims the caret, and registers nothing.

  A `]` run may follow the identifier when an unescaped `[` is still outstanding, counted
  over the block: `[[\[^1]` and `[\[^1]]]` register while `\[^1]` does not, and neither does
  `# ![[[[link](u)]]](\[^1]`, whose four openers are all already closed.

  Eleven cases, including the three `probe/escaped-label/*` the family was named for.

- 6b1e8cb: Every `#` in a wikilink becomes a heading separator in the display.

  `[[a#^blk a#^blk]]` displays `a > ^blk a > ^blk`, where only the first separator had been
  converted.

- 3ee9820: A fenced block's closing delimiter below its item's content column now ends the item.

  A fence opened inside a list item keeps its own shallower body lines — that already worked, and
  it is why a wide-separator item can hold a fence at all. Its **closing** delimiter is different:
  a closer shallower than the column the item opened with is not the item's closer at all.
  Obsidian ends the item there and reads the line as a new fence at root, unclosed, running to the
  end of the note.

  The comparison is against the column the item **opened** with, not the running minimum. A
  shallower body line legitimately lowers an item's content column as it arrives, so without that
  distinction a body at two columns would make a closer at two columns look like ordinary content
  — `-` four spaces `~~~` over two spaces `body` over two spaces `~~~` is one list and one code
  block in Obsidian, and was one list here.

  Four shapes were probed against the running application with the body and closer indents varied
  independently, plus the two controls that already agreed: a closer at the item's own column
  closes normally, and a closer at column zero already ended the item.

- 9d84a22: A backtick line indented four or more columns is code, not a fence.

  The adjacent-indented-code merge excluded fenced blocks by matching `/^[ \t]*(?:```|~~~)/`, which
  also matches a line that merely _looks_ like a fence while being indented code. CommonMark makes a
  fence indented four or more columns indented code instead, so the bound is three:

  ````
      ```
  Text `[^x]`
  [^1]: body text
      ```
  ````

  That is one indented code block whose first line is backticks, and the guard refused to merge it.
  Four of the six remaining same-lines-different-grouping documents were exactly that shape.

  Obsidian's code-block ranges move from 843/883 to 847/883 agreeing, with the footnote dimension
  unchanged and no corpus regressions.

- d3b4bb9: An indented-code block inside a list item is no longer mistaken for an unterminated fence.

  `fenceOutlivesTransform` trimmed a code node's source before testing it for a fence opener, so
  every indented-code block looked like one. A `code` node's slice is relative to its container, so
  inside `- p` an opener written at six columns arrives as `    ~~~` — four spaces, which is
  indented code and no fence at all. The pass then swallowed the lines after it:

      - p / blank / ⟨6sp⟩~~~ / lazy / [^1]: def / ⟨6sp⟩~~~

  Obsidian reads `lazy` and the label as one paragraph and indexes `[^1]` as a bare reference at
  column 0. We produced a single code node covering both and indexed nothing — text inside code is
  literal, so the reference was invisible to the bare-reference scan.

  The opener test is now bounded at three spaces, which is CommonMark's own rule. A leading tab is
  four columns and correctly fails it too.

      referee 6208 -> 6229 / 6818   +23 GAINED, 2 LOST, by --ids identity
      probe:h3 family               8 of 48 failing -> 1
      main parity gate green, 457 tests, 0 probes drifted, 4 gates green

- 5cab7af: A fenced code block or `$$` math block inside a list item now keeps lines indented less than
  the item's content column, so its content is no longer split out into a paragraph. `*⟨4sp⟩~~~` over three-space
  content and a matching closer is one code block, and a `[^1]` written inside it stays buried as
  Obsidian has it; the fence had closed empty and the content had become live text. A blank line
  still ends the item, and a shallower line outside a fence still begins a sibling.
- ba5a235: Never produce a node whose start is after its end.

  `definitionEndBeforeLabelTransform` pulls a definition's end back to before a trailing label, then
  clamps every descendant whose end runs past the new reach. It did that without checking whether
  the descendant's **start** was also past the reach — so a node at `[15..36]` became `[15..14]`,
  which is impossible rather than merely wrong.

  `legacy` promises exact positions because consumers index by them: `obsidian-linter` splices by
  offset, so an inverted node corrupts an edit rather than misreporting one.

  A descendant starting past the new reach now keeps its own span. It lies wholly outside the
  definition's new extent, so its own span is the honest one — and that trades an _impossible_
  position for a child-escaping-parent, which `invariants.test.ts` records as a ceiling rather than
  asserting away.

  <!-- prettier-ignore -->
  ```
  structurally impossible positions   8 documents / 20 kinds  ->  1 / 2
    every `start AFTER end` violation gone                       31 of 33
    remaining: `end PAST source` on one document, a different class
  legacy referee                      6208/6818, BYTE-IDENTICAL
  ```

  Verified by `--ids` identity rather than an equal total: 0 gained, 0 lost.

- 856162f: Never shift a position point twice when a parent and child share one.

  `quoteLazyIndentedCodeTransform` re-parses whatever a quote held after an indented run and rebases
  the fragment onto the document with `shiftBy`. For a one-line quoted fragment, `reparse` returns a
  `blockquote` whose `position` **is the same object** as its `code` child's — verified by reference
  equality, not inferred. The plain recursion therefore wrote `+offset` at the quote and again at
  the code, turning `[0..3]` into `[160..163]` on a 134-character note: a span past the source,
  which `invariants.test.ts` asserts can never happen.

  `shiftBy` now tracks visited point objects in a `WeakSet` and shifts each at most once.

  <!-- prettier-ignore -->
  ```
  structurally impossible positions   1 document / 2 kinds  ->  0
    combined with the previous fix, all 33 violations on all 8 documents are gone
  legacy referee                      6208/6818, BYTE-IDENTICAL
  ```

  The eight sources stay recorded with no expected violations. Emptying the list would delete the
  only inputs in CI that exercise either fix, since the referee corpus they came from is not
  vendored.

- b255f88: A second footnote definition under quoted prose folds like the first.

  A definition may not interrupt a paragraph, and `footnoteInterruptTransform` folds one that tries.
  Its adjacency test required a leading `\n` in the gap between the paragraph and the definition —
  which cannot be satisfied when the two nodes _touch_. Inside a quote that is exactly what a folded
  predecessor leaves behind: folding `> a` / `> [^1]: d` stretches the paragraph to offset 16 and the
  next definition starts at 16, because micromark bounds a definition in a quote up to the next block
  rather than to its own last character.

  So `> a` / `> [^1]: d` / `> [^2]: e` folded the first and defined the second, where Obsidian defines
  neither. At root the same chain works because the spans do not touch, which is why this was
  invisible outside a container. Measured against the reference stack, `remark-parse@8` +
  `remark-footnotes@2` reports no definitions for either shape and micromark reports both.

  An empty gap now counts as adjacent, guarded by `previousLineHasContent`: an empty gap also arises
  when the previous node's span swallowed a blank line, which an indented fence does, and folding
  there lost two documents of the form `<4sp>```` / text / `[^x]: …`/`<4sp>````.

  Footnote agreement moves from 6018/6818 to 6028/6818 with zero regressions, verified by identity.
  Seven probes against live Obsidian now agree where four did.

- 1ffa863: A list folded into a footnote definition from a later line reports no items.

  `[^1]: body` over `2. item text` reports no list item, where a list on the definition's own
  line still does.

- a075f4d: Take the line below a footnote definition into it

  A definition whose first line carries content already absorbs what follows by ordinary
  lazy continuation, so `[^1]: one` / `b` was always one definition. But lazy continuation
  needs an open paragraph, and there is none when the first line is empty or is a bare
  container opener — `[^1]: `, `[^1]: >`, `[^1]: -`, `[^1]: > >` — so the definition ended
  and the next line was left behind as a sibling paragraph, leaking content Obsidian
  renders nowhere.

  A blank line still ends a definition, and only a paragraph is absorbed: an interrupting
  block genuinely ends one.

- ee25a76: A footnote definition a list or quote absorbs lazily is folded into that block's paragraph as
  Obsidian reports it, and its continuation line becomes a block of its own. `- item` /
  `[^1]: def` / `%%` is a list and a root comment with no definition at all; the definition had
  survived inside the item, because the fold tested adjacency with line numbers that a
  by-offset splice leaves stale.
- f2b219b: A list item now covers a footnote definition folded into its trailing paragraph.
  `> - item` / `[^1]: def` left `listItem 2->8` holding a `paragraph 4->18`, because the fold
  stretched the list and the paragraph but not the item between them.
- 32e9084: Rejoin a footnote reference a construct split apart

  Obsidian parses nothing inside a footnote reference's label, so `[^%%note%%]` is a
  reference to the label `%%note%%`. We let the label tokenise, and whatever formed there
  took the closing bracket out of reach of the bare-reference pass — which only ever sees a
  single text node — so no reference formed at all:

  ```
  [^%%note%%]   text "[^" + comment + text "]"
  [^==mark==]   text "[^" + highlight + text "]"
  [^<br>]       text "[^" + html + text "]"
  [^_under_]    text "[^" + emphasis + text "]"
  ```

  Deliberately narrow: it fires only where such a run is currently split, which is exactly
  where no reference exists today. Unreachable footnote labels in the corpus drop from seven
  to two.

- c905fde: A footnote name may not hold ASCII whitespace.

  `a[^x [y] b` is no reference in Obsidian, where it had been claimed as one named `x [y`.
  A name carrying U+00A0 or U+3000 is still accepted.

- 5ca332d: Write a footnote reference's label verbatim

  `mdast-util-to-markdown` escapes a `[` inside a footnote label, which is right for
  CommonMark and wrong here: Obsidian's label runs to the first `]`, so `[^![[img.png]`
  re-parses to exactly the label it was written from while `[^!\[\[img.png]` does not.
  Re-parsing those escapes gave a label holding backslashes, which the next pass escaped
  again.

  Inputs that formatting cannot settle drop from 69 to 33 — below the 35 they stood at
  before the footnote-label rule landed.

- 27d2878: Require a block comment's opener line to hold no other percent sign.

  Measured against Obsidian: `%% 50%` and `%%%` are ordinary paragraphs, so an
  opener is not simply "a line beginning with `%%`" — any further `%` on that
  line disqualifies it. Container prefixes still come first, since `> %%` opens
  one inside a quote.

  This also, correctly, stops a self-closing `%% a %%` from being treated as a
  block region; that is an inline comment and belongs to the text construct.

  Two cases move to matching. Two more from the same rule remain: an unclosed
  `%%` still opens a region through the micromark construct, which needs the
  check inside the tokenizer rather than in the region pass.

- 3207ffd: A document whose frontmatter fence never closes parses normally again.

  `---` followed by `1. x` is a thematic break and a list in Obsidian.
  `micromark-extension-frontmatter`'s construct is `concrete`, so opening on line one and
  finding no closing fence degraded every container in the rest of the document to a
  paragraph — the list on line two and any later one equally. Everything after the fence line
  is now re-parsed once and spliced back with its real offsets.

- 0c60cbe: A setext underline needs a single content line to make a heading.

  Obsidian parts company with CommonMark here, and the spec's own examples are
  the evidence: 81 (`Foo *bar` / `baz*` / `====`) and 82 are multi-line setext
  headings per CommonMark, and Obsidian reports no heading for either — the
  whole thing is one paragraph. `remark-parse@8` only makes a heading from a
  single content line.

  The demoting pass already handled a sloppy underline, an indent or trailing
  whitespace cancelling the heading. It now also demotes when more than one
  content line sits above the underline, which covers 17 cases including the
  two spec examples.

- 568d919: Tokenize `==highlight==` the way Obsidian does, and fix a crash on any span that
  crosses a line ending.

  Highlight was a CommonMark attention construct. Obsidian scans forward instead,
  using `remark-parse@8`'s `strong.js` without its `charAt(index + 2) !== marker`
  guard: close at the first `==`, and fail the whole attempt when the content
  would be empty. That failure is what makes an over-long run behave — in
  `====text==` the attempt at the first `=` dies on empty content, so the retry one
  character along leaves a literal `=` and highlights `=text`.

  Two rules the attention model had been providing for free now have to be stated,
  and both were measured rather than assumed: content may not begin or end with
  whitespace (`== text==` and `==text ==` highlight nothing), and the surplus of a
  doubled closing run stays literal.

  Scanning raw codes also removes the dedicated backslash construct added
  alongside the escaped-closer work. `==text\==` closes on the escaped run and
  keeps `text\`, because the scan never consults CommonMark's escape rules;
  `\==text==` never opens, because micromark's own escape consumes that `=` before
  this construct is tried. The opener/closer asymmetry now falls out rather than
  being special-cased.

  **This also fixes a crash shipped with the emphasis port.** Both legacy ports
  decide a whole match up front and then consume it, which swallowed line endings
  inside the span's text token. That desynchronizes micromark's chunked token
  chain and throws `expected no next token` from `subtokenize`, far from the
  construct responsible — so _any_ multi-line `*a\nb*`, `**a\nb**` or `==a\nb==`
  crashed. The shared `planBody` helper now splits a match into `lineEnding`,
  `text` and trailing-`data` segments, and both constructs walk it. No corpus case
  covered a multi-line span, which is why the gate stayed green; there are
  regression tests for it now.

  Two corpus cases.

- d012b8d: Stop a display-math opener at two markers, closing the last reported divergence.

  Obsidian's display delimiter is exactly `$$`, and it pairs with the very next
  `$$`. An over-long run therefore opens an empty span and leaves the rest as
  text: `$$$$x^2$$` is empty math followed by a literal `x^2$$`, and
  `$$$$x^2$$$$` is two empty spans around a literal `x^2`. We consumed the whole
  run as one opener, which made it four markers wide so nothing could close it.

  These were the last two cases triaged `report-upstream`, and the change was
  held back earlier as too risky to attempt. It was not: `goldens/math-content.json`
  is a second oracle recorded against 1.14.2 holding 78 math cases with their
  exact `tex` bodies, built for precisely this kind of change. Both oracles
  confirm it — 1122-case corpus unchanged except for the two, and all 78 math
  cases still pass.

  The two entries were pinned there as `divergent`, and the oracle's two-way
  policy caught them the moment they started matching; both are re-triaged. With
  these closed, `report-upstream` is empty: every divergence this package records
  against Obsidian is now one it reproduces.

- a3ab930: Treat a multi-line setext heading over a definition as one paragraph.

  `H` / `===` / `[^1]: real` is a heading and a definition, but
  `para` / `more` / `===` / `[^2]: b` is a single paragraph to Obsidian. The
  definition cannot interrupt a paragraph, so with more than one line above it
  the paragraph runs on and the underline is just text in the middle.

  The discriminator is the number of content lines, and it was found the hard
  way: merging on the presence of a following definition alone cost twenty cases
  that already matched, every one of them single-line.

  Counting those lines needed a second fix. micromark reports a setext heading's
  start at the beginning of the block that became it, which can sit _before_ a
  link reference definition it never contained — `[ref]: /url` / `para` / `===`
  yields a heading whose start offset is 0. Slicing from there counted the
  definition as a content line, and would have rebuilt it into the paragraph.
  Both setext passes now measure from the heading's children instead, which also
  removes that latent corruption from the pass added earlier.

  One corpus case.

- 8104686: Collect links and embeds in document order when recording.

  The recorder queried `a.internal-link` and `.internal-embed` separately and
  concatenated, so every link preceded every embed regardless of where they
  sat. 46 cases differed on ordering alone while both sides had found exactly
  the same targets.

  One query returns them in document order, and the rule that only source-level
  embeds count is unchanged — a transcluded note renders its own embeds inside
  the outer one, so counting descendants would report three for a single
  `![[ ]]`.

  This is a harness fix, not a parser one: 42 cases move to matching and 44
  goldens change, all of them reorderings.

- c112383: Widen the parity corpus from 1141 to 1469 cases, and record what it finds.

  The corpus could only ever be as good as its blind spots, and it had some. Two
  sweeps went looking: an edge-case hunt across Obsidian's own constructs, and a
  survey of the test suites of other Obsidian-Markdown implementations
  (obsidian-help, goldmark-obsidian, obsidian-export, mdformat-obsidian,
  lezer-markdown-obsidian, remark-callout, quartz).

  Four token axes join the generator — strikethrough, the two wikilink forms
  carrying a second field, and the bare footnote reference — along with five
  container contexts whose own syntax collides with an inline token. 158 seed
  cases cover surface the generated layers cannot reach.

  Of the 328 new cases, 268 already match and 60 diverge. None of the 1141
  earlier cases regressed, so the new surface is genuinely new rather than a
  re-measurement. The 60 are recorded as `replicate` with their divergence
  pinned, the largest groups being block references (13, a construct no case
  covered at all), callout marker syntax (12) and embed targets (7).

- 119fbae: Carry a footnote definition into a quote's lazy continuation.

  A column-0 line that looks like a definition no more interrupts a blockquote's
  lazy continuation than it interrupts a paragraph, so
  `> [^1]: quoted def` / `plain column-0 line` / `[^2]: second` is all one
  blockquote to Obsidian where we reported a blockquote plus a definition.

  A list is deliberately excluded. There the definition belongs folded into the
  item's own paragraph, which `footnoteInterruptTransform` does later; absorbing it
  here as a sibling child instead renders the body in the footnote list rather than
  inline, which costs three cases that already match. Three corpus cases.

- 39758a6: Reduce a stripped footnote reference to its lowercased identifier.

  Obsidian shows the identifier rather than the label as written, so `[^Cell]`
  nothing defines reads `cell` and `[^P.]` reads `p.`; we were keeping the original
  case. The same normalisation fixes a latent bug in the revival path added
  alongside it: mdast lowercases a definition's identifier, so looking it up with
  the label as written missed every reference whose label was not already
  lowercase. Two corpus cases.

- 0a74667: A backslash hard break works inside emphasis, a highlight and strikethrough.

  `*foo\` over `bar*` renders `foo bar`; the backslash survived as content. The legacy body
  planner must emit each line ending as its own token, so the subtokenizer never saw the `\`
  and the newline together. `*foo\\` over `bar*` still keeps its literal backslash.

- 9092d90: A heading's reported column now matches Obsidian for an indented heading.

  ` ### foo` is reported at column 0 by Obsidian, not at the `#`. The sections projection
  already applied that clamp; the headings projection did not.

- d010063: Vendor the inline-math tokenizer to implement Obsidian's flanking, escape and
  closing-run rules.

  `micromark-extension-math` applies no flanking rules and asserts its own `previous`
  guard internally, so these rules could not be added by wrapping it. Its `math-text`
  tokenizer and resolver are now adapted into `src/lib/syntax/math-text.ts`, with
  attribution in `LICENSE-THIRD-PARTY.md`. Token names are unchanged so
  `mdast-util-math` still maps them, and block math continues to use the upstream flow
  construct because every block case already matched.

  All three of Obsidian's inline-math divergences are implemented:

  - A lone `$` followed by a digit or whitespace does not open, so `$5 and $10` and
    `costs $20,000 today` are currency rather than math.
  - A backslash escapes the closing delimiter, so `$x^2\$` is not math. Obsidian
    honours the escape for math while ignoring it for wikilinks, embeds, highlights
    and comments.
  - A closing run consumes only as many markers as the opener used and leaves the rest
    as literal text, so `$x^2$$` is math followed by `$` and `$x$$next` is math
    followed by `$next`.

  Upstream also refuses to open when the preceding character is `$`, which stops an
  over-long opening run from pairing, so `$$x^2$` finds no math. That guard is now
  relaxed, but only when stock `remark-math` is not also registered for `$`: micromark
  still attempts its tokenizer in that case, and its internal assertion fires on a
  state we legitimately create. The condition is evaluated during tokenization, where
  the merged construct list is visible, rather than at plugin setup — this package
  initialises before a consumer's math plugin does, so it cannot know at setup time.

  That means no release coordination is needed. With the duplicate present the guard
  stays strict and nothing crashes; when a consumer stops registering a second math
  parser, `$$x^2$` starts parsing on its own. Measured across the corpus, removing the
  duplicate registration unlocks six cases, 273 to 279, with no crashes either way.

  The flanking rules are inert wherever a consumer also registers stock `remark-math`
  for `$`, because micromark falls through to the ungated construct. Measured against
  the corpus, that duplicate registration costs four cases, two of them the currency
  ones.

- 95cd024: Drop a continuation line's indent from a highlight

  A paragraph's continuation line loses its indent everywhere else in micromark, so a
  construct that consumes raw characters has to drop it too. `==a` / `    b==` held
  `a\n    b` where the same text outside a highlight holds `a\nb`.

- aa8bc94: `==highlight==` is no longer quadratic on a long run of `=`.

  The decision function needs four characters to reject `=` x20000 -- a closer sitting on the
  opener has empty content -- but the chunk scan behind it read to end of input first, once
  per opener. Bounding that scan at the two conditions the decider already treats as final
  takes 20000 from over 20 seconds to 149ms, and growth from ~4x per doubling to ~1.96x.

- cac62f9: `commonmark/html-blocks/171` is a rendering divergence, not parse debt, and is re-triaged
  out of the backlog. `<textarea>` is RCDATA to the HTML parser, so the detached recorder
  swallows the rendered blocks after it while a real Reading View renders them as
  paragraphs. Obsidian's own section parse sides with us, and the recorded golden mixes one
  projection from each renderer.
- d8542b0: An HTML comment inside a `%%` comment no longer cuts it short.

  `commentRegionTransform` rebuilds the document around a `<!-- ... -->` region whose shape the tree
  does not already represent. A `<!-- x -->` written _inside_ an Obsidian `%%` comment is already
  represented — as that comment's own text — but the pass could not see that, rebuilt around it, and
  in doing so cut the `%%` node at the opener and promoted the HTML to a root sibling. Everything
  below it was then released:

  ```
  %%
  Text <!-- x -->
  [^a]: def
  ```

  Obsidian buries `[^a]` here, as it does without the HTML comment; we defined it. The same cut ran
  the other way when the `%%` was closed — its real closer was then read as a fresh opener and
  buried a label Obsidian keeps — so one containment test fixes both directions.

  Found by reducing real corpus documents against the live application rather than by hand-built
  probes: an HTML comment nested in a `%%` region turned up in about a fifth of the reductions for
  this family, and six rounds of hand-built minimal forms had never produced that shape.

  Differential harness: 6066 → 6080 of 6818 documents, reference assertions 17987 → 18003.

- 0f74aab: An html comment Obsidian's parser rejects renders as visible text.

  remark-parse@8 keeps CommonMark 0.28's restriction and micromark dropped it: a comment's
  body may not contain `--`, start with `>` or `->`, or end with `-`. So
  `foo <!-- a -- b --> bar` and `foo <!--> foo -->` read in full rather than vanishing.

  Done in the projection, so the tree and the serialiser are untouched -- which is what
  lifts the standing refusal on `raw-html/626`, whose earlier fix converted the node to text
  and grew a backslash on every format pass.

- 76b5150: An html block inside a quote, callout or list item now runs on through the column-zero line
  below it, as it already does at the top level and as Obsidian reads it. `- <div>` over
  `Text[^2]` is one html block with nothing indexed in it; the line had been a paragraph of its
  own with a live reference.
- d15543b: Split a setext underline off an html lazy line after a list. `- item` / `<div>` / `---`
  reports the list ending at `<div>` and a root thematic break in Obsidian; micromark hands the
  html line and the underline over as one html node, so the list swallowed both. The prose form
  already worked, so this is the same split for a second node type.
- 30a226a: A setext underline directly under a raw HTML line makes a heading

  Obsidian reads `<br>` over `===` as a heading named `<br>`, and the tag is
  irrelevant — `<div>`, `<span>`, `<p>`, `</div>` and an unknown `<x-tag>` all behave
  the same. What matters is that the underline is the **second** line: `<div>` / `a` /
  `===` keeps its html block, and `<pre>` / `---` / `</pre>` becomes a heading plus an
  html block holding `</pre>`.

  micromark opens an HTML block for the whole run, so the underline was swallowed and
  no heading appeared.

  The heading's content is inline html rather than text, which is what makes both
  oracles agree at once: the browser renders `<br>` as an element so the heading's
  rendered text is empty, while `metadataCache` still reports the raw `<br>` it read
  from the source.

  16 of 17 new `probe/html-block/*` cases match, from 8 before.

- a7e6d3c: Take an html line's setext underline from the next sibling

  At root an html block swallows the underline, so both lines sit inside one node. Inside a
  container they do not: the html node is just the tag and the run arrives as the next
  sibling paragraph — so `- <br>` / `===` found a single line and was skipped, where Obsidian
  reports a heading.

  The underline must be on the very next line. A blank line ends the container's block, and
  the run is then prose of its own.

- f77feb2: An html block is serialised without its trailing line endings.

  micromark gives an unclosed html block a span running through the line ending after it, so
  the value ends in `\n` while the block separator writes one too. Written raw the two add
  up, and an unclosed comment re-absorbs the surplus on the next parse, so an indented
  `<!--` inside a footnote definition gained two line endings on every format pass forever.

  Reproduced on bare `remark-parse` + `remark-gfm` + `remark-stringify` with none of this
  package loaded, so the defect is upstream; this is a guard against it.

- 55498b3: The parity harness now strips html tags with a scanner rather than a regex.

  A `>` inside a quoted attribute value does not close a tag, so a two-line `<a>` renders
  no text; a regex stopping at the first `>` leaked the attribute tail. The quote rule holds
  for tags only -- `<!` and `<?` are bogus comments that end at the first `>` whatever
  quotes enclose it, which `<?php` / `echo '>';` / `?>` is the case that proves.

- dec9762: Place a short-indent-plus-tab line past its own indent

  `remark-parse@8` does not count a tab that follows a space, so one to three spaces plus a
  tab is content rather than indented code. That line is re-parsed without the whitespace
  that never counted, and the result was anchored at the line start rather than past it — so
  the content was placed on top of its own indent.

  `  \tfoo` reported a paragraph spanning `  \t`, which named the section after the
  whitespace and dropped `foo` from it entirely. `  \tfoo\tbaz\t\tbim` lost `bim` the same
  way.

- 36a5a1a: An indented ordered list below a footnote definition continues it.

  `[^1]: def` over `  10.     Some words` is one definition, where the list's indentation had
  left it a sibling.

- 14f85be: An inline footnote inside a highlight reports as a marker, not as its body.

  `# ==^[inline]==` reports the highlight's content as the footnote marker. The lighter text
  collector handled `[^1]`-style references but not the inline `^[…]` form, so its body
  leaked into whichever construct enclosed it.

- dd85449: Refold a paragraph by how much it highlights, not by whether anything was highlighted

  `inlineRefoldTransform` bailed the moment the paragraph already held a highlight, so
  `H` / `  ===` / `[^1]: ==a==` kept the small highlight the first parse found and never
  formed the large one Obsidian reports — which opens on the `==` of the former setext
  underline and closes on the last `==` two lines down.

  A paragraph can hold both a delimiter the tokenizer judged and one it never saw. The pass
  now compares how many characters each reading highlights, which keeps it inert everywhere
  the two agree.

- 2b6a09d: A line of invisible whitespace ends the block above it and becomes its own paragraph.

  A no-break space is whitespace to the blank-line test but is not nothing, so `> [li` over
  one renders `<blockquote><p>[li</p></blockquote> <p>&nbsp;</p>`. micromark takes the line
  as an ordinary lazy continuation and the quote swallows it.

- 7fc0d19: An unclosed `%%` that is a list item's own content now swallows the blocks below it, as one
  opened inside a blockquote already did.

  A definition buried that way stops defining and its label is indexed as a reference instead,
  which is the asymmetry Obsidian applies to every commented definition. Previously the
  definition stayed live, so a footnote Obsidian does not define was defined and the reference
  it does index was missing.

  The comment is bounded by lazy continuation, so a blank line, a marker, an ATX heading or a
  fence below the opener ends it rather than the end of the note. A `%%` indented four columns
  past the item's content is indented code and opens nothing, which needs no code here -- the
  tokenizer already produces `code` rather than `comment` for it.

  Referee agreement 5745 to 5762 of 6818 documents, with no corpus regressions.

- f48f8f9: A list item's content column is the smallest indentation among its own lines, not its marker's
  width, so a continuation line indented below the marker pulls the definition column down with
  it. `- a` over a one-space lazy line and a four-space `[^1]: def` is a definition at column 1;
  it had been reported at 2. A column-0 lazy line is left out of that minimum, which is the half
  of the rule that was already right, and a tab counts to its four-column stop.
- 9879c6a: A single-digit `1.` marker moves its item's indented-code threshold out by one, matching the
  adjustment already applied to the definition column. `1. item` over a seven-space `[^1]: def`
  is a definition at column 4; it had been read as indented code and produced no definition.
- 4238817: An indented closing fence below a list item now closes the item's own fenced block instead of
  opening a new one. `- a` over an indented `~~~`, a column-zero line, and a matching indented
  `~~~` ends the fence there, so the rest of the document is parsed normally; the closer had
  started a second block that ran to the end of the note and swallowed everything after it. A
  column-zero closing fence still opens a block of its own, as Obsidian has it.
- 6e8fb90: An unclosed comment in a list item swallows the line below it.

  `-  <!--` over `Prose here[^1]` indexes nothing on the second line, as Obsidian does.

- b63ef55: A lazy line that ends a list item is now root indented code, as it already was for a quote.

  `*` four spaces `item` followed by a four-space line is a list and a separate code block in
  Obsidian, not one list swallowing the line. The rule already shipped for blockquotes; a list
  item needs two extra conditions, both measured.

  The line must sit **below the item's own content column** — four spaces under a content column
  of five is not the item's content, while the same line under `* item` (content column two) is.
  And it must **open a block**: a fence, an ATX heading with its space, a `%%`, or a list marker
  of a different kind. Plain text, a quote marker, a thematic break and a link-definition label
  are all absorbed as lazy continuation instead, which is the opposite of how a blockquote
  behaves — a quote releases any indented lazy line.

  The same-marker exclusion is what keeps CommonMark's staircase examples intact: four spaces
  then `- e` under three spaces then `- d` is a further item, not code.

- 9d19f99: A list item's prefix width is now measured in columns, so a tab in it no longer counts as one.

  `2)` tab four-spaces `More` over seven-spaces `[^1]: def` is a definition at column 4 in
  Obsidian. The item's prefix width decides how much indentation the item's own content keeps, and
  it was computed by character count — a tab counting one — so the prefix came out three columns
  wide instead of four. The label line then kept four spaces, exactly the indented-code threshold,
  and the code block swallowed the definition.

  The character count came from trusting `sliceSerialize(token, true)` to expand tabs. It does
  not: it replaces a tab with a **single space**, so `"2)"` tab serialises to `"2) "` either way.
  Counting columns from the raw slice is what gives four.

  This affects any item whose marker separator or leading indentation contains a tab, and it is
  the quantity three earlier attempts in this area were reaching for by other means.

- 3066346: A tab after a space in a list marker's separator does not widen the item.

  The reference rules group `- <TAB>` with `- ` and `-     ` at a content column of 2, while
  `-<TAB>`, `-<TAB><TAB>` and `10.<TAB>` sit at 4 — a tab reaches its column stop only when it
  _opens_ the separator, and after a space it contributes nothing.

  `contentColumn` already measured it that way. The item's own `size` did not, so
  `- <TAB>item` / blank / `<2sp>[^1]: def` left the definition at ROOT and, because the item was then
  one line, read its content as indented code:

  ```
  listItem@0-0 > code@0-0        and footnoteDefinition at root
  ```

  `columnsOfRaw` has a single caller — the item's `size`, an ownership threshold, which is where that
  asymmetry belongs by its own docstring's reasoning.

  Measured: a 144-cell grid over the reference rules' full marker table goes from 2 diverging cells to
  0; the probe ledger moves from 1594 agreeing to 1612, every one of the 18 reporting "NOW AGREES
  with Obsidian"; the compute oracle drops from 24 diverging projections to 21, lowering three
  recorded ceilings (`footnotes` 5→4, `listItems` 5→4, `sections` 2→1); and footnote agreement moves
  from 6015/6818 to 6018/6818 with zero regressions, verified by identity.

- 674a3b0: A `[` straight after a balanced `]` is a label opener and is not rendered.

  `[foo][ref[]` renders `[foo]ref[]`, so the bracket after the closer is consumed and the
  label shown bare. The closer has to balance to depth zero -- `[ref[][]` closes an inner
  bracket while the outer waits, and renders whole -- and the rule is off inside a link
  label, where a bracket is content.

  Dropped in the projection, not the tree: Obsidian discards the character, so removing it
  from a node value would let a formatter delete a bracket the author wrote.

  Adds a 13-case probe wave settling the two families wave 1 left open. Corpus 3291 -> 3304.

- df02b7b: A `[` straight after a `]` opens a link label, not a wikilink.

  `a [x][[w]] b` renders `a [x][w]] b` in Obsidian and indexes no link -- the first bracket
  of the `[[` is a label opener for the text that just closed. After a footnote reference, a
  wikilink or an inline footnote the `[[` still opens a wikilink, and an embed is unaffected
  because its `!` keeps the bracket off the closer.

- c75ff5b: Accept a reference destination after the outermost label

  `[a [b](u)][r]` is a reference to `r` whose text reads `a [b](u)` — the same
  outermost-pair rule as the inline form, with `[r]` where `(u)` would be. That closes
  CommonMark's spec examples 532, 533 and 535 through 538.

  A reference destination is itself a bracket pair, so the scan offers it as the next label:
  `[foo][bar][baz]` had `[bar]` — already spent as `[foo]`'s destination — relabelled and
  pointed at `[baz]`. Labels beginning before the last destination's end are skipped.

- c601e40: A defined label still resolves after a relabelled link.

  `[foo][bar][baz]` with only `baz` defined is `[foo][bar]` as literal text and `[baz]` as a
  shortcut reference reading `baz`. Taking `[foo][bar]` as the outer reference is what
  `labelPrecedence` is for, but everything after it was pushed as one text node, so `[baz]`
  was written out.

- a231768: Close a link label where raw scanning closes it

  CommonMark lets a code span, an html attribute, a math span or a comment own a `]` and
  carries the label past it. Obsidian's scan looks inside nothing, so that `]` closes the
  label — and what follows is usually not `(`, which means no link at all:

  ```
  [a`]`b](u)     entirely literal: the label is `a`` and a backtick follows
  [foo`](u)`     a link to `u` labelled `foo``, with a backtick left over
  ```

  Same comparison either way: where the tree's label runs past the raw close, the link is
  rebuilt if a destination follows that close and removed if not.

- 4fdbcfc: A lazy continuation line joins the innermost open list item.

  `- - ` with a fenced block followed by an unindented line now extends the inner item, where
  only the outer one had been stretched over it.

- 9aee59e: Inline constructs survive a line ending in two more places.

  A `%%` comment with no closer now hides what follows it however deeply nested, so `> > %%`
  over a lazy line renders nothing. Inline math inside emphasis is recognised across a line
  ending, and so is an inline footnote spanning a lazy continuation line — `- ^[i` over `e]`
  is one note.

- ee4dd34: An indented line below a non-1 ordered marker under a quote is root code.

  `2.`, `10.` and `2)` cannot interrupt a paragraph, so below a quote they do not open a list --
  the line is lazy continuation, and an indented line beneath it falls to ROOT indented code.
  `container-lazy.ts` already carries that reasoning for a callout host; this is the same rule with
  a quote host, the input class it was never scoped for.

  Measured against live Obsidian, `>` / `<marker>` / `<5sp>Some`:

  ```
  1.  no code     2.  code@2      -  no code
  1)  no code     2)  code@2      *  no code
                  10. code@2      +  no code
  ```

  So the discriminator is `start !== 1` rather than the marker's width, a bullet never releases
  however wide, and the quote is required -- a blank line in its place releases nothing. The shape
  carries 19 of the 883 code-bearing referee documents with 15 diverging, 78.9% against a 6.5% base
  rate, the strongest conditional signal measured on this corpus.

  Two guards keep it honest, both derived from documents an unguarded version cost. The released run
  must be CONTIGUOUS with the marker line, because lazy continuation continues the line above it and
  an intervening column-0 definition means the list has already ended. And the line must be STRICTLY
  DEEPER than the item's content column -- the inverse of the shallow test the sibling arm applies,
  since this one is about a line too deep to be item content rather than too shallow to belong.

  Obsidian's code-block ranges move from 826/883 to 832/883 agreeing and the footnote dimension from
  5994/6818 to 5996/6818, with ZERO regressions on either -- verified by comparing the agreeing sets
  by identity rather than by their totals, since two documents trading cancel perfectly in a net
  figure.

  A third guard earns that. The quote must be ADJACENT to the marker and not merely its previous
  sibling, because a blank line between them closes the quote, so the marker opens a real list and
  the deeper lines become the footnote definition's own content:

  ```
  >  / 10. [^a]: def / <6sp>%%            code@2   def a@1-1
  >  / blank / 10. [^a]: def / <6sp>%%    no code  def a@2-3
  ```

  A blank line is not a node, so the sibling test cannot see it. That shape is both documents an
  earlier attempt traded away, and the definition ending at line 3 rather than 1 is the oracle
  saying those lines belong to it.

- 967978d: Every container a lazy setext underline was found through now shrinks, not just the outermost
  and innermost. `> - item` / `title` / `===` left `blockquote 0->8` holding a `list 2->18` --
  a child outliving its parent -- because the helper locating the paragraph descended through
  the list without the list being shrunk afterwards.
- 4158d56: An unclosed `%%` split off a lazily-absorbed definition now runs to the end of the note.
  `> [!note] title` / `[^1]: def` / `%%` is a callout and a comment swallowing everything after
  it in Obsidian; the comment had been bounded at its own line, leaving the trailing paragraph
  as a section Obsidian does not report.
- c50260b: An html block a list absorbs lazily no longer carries a `%%` on its next line into the list.
  `- item` / `<div>` / `%%` is a list and a root comment in Obsidian; micromark spans the html
  node over both lines, so the comment was swallowed with it.
- ceff0a4: Test the seam with `rehype-obsidian`, and pin the crash it found.

  Every other test projects from mdast, which measures the parser well but
  never exercises the hand-off: this package emits a node, `remark-rehype`
  converts it, `rehype-raw` re-parses that through HTML, and only then does
  `rehype-obsidian` see it. `renderOurs` has run that full chain since the
  first commit and nothing ever called it.

  Calling it found a live bug. Three transforms re-parse a fragment with
  `self.runSync(self.parse(md), md)`, where `self` is the whole processor — and
  `runSync` refuses as soon as that processor holds an async plugin, which
  `rehype-obsidian` is. A task list item or a `%%` comment with a tail
  therefore throws in the real Quartz chain. It was invisible because the
  harness builds a markdown-only processor, where no async plugin exists.

  Pinned as a failing-by-design test rather than patched: re-parsing through
  something narrower than `self` changes which transforms a fragment sees,
  `remark-breaks` among them, so it needs measuring against the corpus.

  Assertions covering unreleased sibling behaviour run against a locally built
  `../rehype-obsidian` when present and skip otherwise, and CI now builds it.

- cded82e: A footnote marker in a link's label is not part of its display text.

  `[x[^1]](url)` displays `x`, while the document's rendered text still shows the marker.

- 59e6e50: A bracket that becomes a link frees its caret for a block identifier.

  `[^1](u)` registers the block `1` and `[^blk](u)` registers `blk`, with no escape needed —
  the label can never be a footnote reference. An image does not: `![^1](url)` registers
  nothing.

- 30154c9: A no-break space separates a link's destination from its title.

  `[link](/url\u00a0"title")` is the destination `/url` with the title `title` in Obsidian.
  CommonMark does not count U+00A0 as whitespace, so the whole thing was read as one
  destination. Only U+00A0 is affected; an ordinary space is left to the tokenizer.

- 96e7b26: A list absorbs the lazy line a setext underline would otherwise claim.

  `- a` / `<br>` / `b` / `---` is one list holding `b`, with the `---` left as a thematic
  break. CommonMark forbids lazily continuing a setext heading into a container, so micromark
  hands back a root heading of `b` + `---` instead. A blockquote is the other way round and
  does keep the heading at root, so this is restricted to lists.

- 42014e2: A list item whose marker separator reaches five columns now keeps a following line indented
  above its capped content column, rather than ending there. `⟨2sp⟩1.⟨5sp⟩Prose here` over a
  four-space `[^1]: Definition` reports the definition inside the item at column 4, as Obsidian
  does; it had fallen outside the item and been read as top-level indented code, producing no
  definition at all. Items without the cap are unaffected.
- 5b687b2: Fixed a crash on a kept `%%` comment inside a list item.

  `- <!--` over an indented body puts a `comment` node — a leaf — where `trailingEmptyItem`
  assumed a `listItem`, so it threw on `item.children.length`. Seventeen documents in the
  referee corpus crashed on this, all one bug.

- 1cb6684: A list continuation indented five or more belongs to the item.

  `remark-parse@8` strips the minimum indentation across the whole item, so ` -    one`
  over `     two` -- content at offset 6, continuation at 5 -- is one item with two
  paragraphs rather than an item and a block of indented code. Measured across eight
  marker widths: the join threshold is `min(contentOffset, 5)`, the cap being one past
  indented code's own reach.

- f7ad32e: A blank line does not end an empty list item, and any indent after it nests.

  `-` / blank / `  -` / blank / `    foo` is one flat two-item list for us and nests the
  second item under the first in Obsidian. CommonMark lets an item begin with at most one
  blank line, so micromark ends the empty item there; `remark-parse@8` keeps it open. The
  threshold is one column rather than the content column, because an empty item has no
  content to set a column against.

- 6cb4019: A list item separated from its next sibling by a blank line now ends at that line.

  `-` / blank / `- b` ends at `1:0` in Obsidian's cache rather than at the marker. The
  sibling is what triggers it — a following block, as in `- a` / blank / `para`, leaves the
  end at the item's own content.

- d7f1834: A list item ends at its last content character when a construct outlives it.

  `- $$y` ends at `0:5` in Obsidian's cache rather than on the next line, and
  `- a` / `    %%` / `    b` ends at `2:5`. Items separated from a sibling by a blank line
  keep their existing end, which is the line start.

- 4a00345: A list item no longer overlaps the item after it.

  `remark-math` extends an item past its sibling's start when a `$$` opener shares its line
  with content; the item's end is now clamped to where the next one begins.

- 20f10cc: Read a tab after a list marker's separator as indentation

  `remark-parse@8`'s list tokenizer consumes the marker and then a single
  whitespace. A tab beyond that survives into the item's content and supplies a
  full indent -- four columns, an indented code block -- so what follows is code
  whatever it looks like:

  ```
  -	item        -> paragraph, the tab is the separator
  - 	item        -> code
  1. 	item        -> code
  - 	[^1]: def   -> code, and so no definition
  ```

  The distinction is the _second_ whitespace: `-\titem` spends its tab separating
  the marker, while `- \titem` has already spent a space.

  The same shape as the quote-marker rule beside it, verified the same way against
  the legacy stack Obsidian parses with. Narrow in practice -- 64 of 6806 recorded
  documents hold the shape -- but it is a real divergence against Obsidian's own
  parser, so it is closed rather than recorded.

- e3a644b: Two lists separated only by a lazily-absorbed footnote label are one list, as Obsidian reads
  them. `- apples` / `[^1]: from the market` / `- pears` is a single two-item list; it had been
  reported as two lists, because the label arrives as its own block and is absorbed only after
  micromark has closed the first list.
- 8226fed: A tab split across a container boundary contributes nothing to the inner indent.

  ` - foo` / `   - bar` / `\t - baz` keeps `baz` a sibling of `bar` in Obsidian where we
  nested it two deep. The outer item's content starts at column 3 and the tab spans columns
  0 to 4, so the outer container consumes three of its four columns and the leftover
  fragment counts for nothing -- leaving only the following space where two columns are
  needed.

- 01b8b95: List-item nesting within a single line is reported as top-level.

  Obsidian's `parent` field is a line number, so `*\t*\t*` — three items all on line 0 —
  reports `parent:-1` for all three rather than nesting the last two. The parse was already
  correct; only the projection over-reported what the field can express.

- aa388ee: A list item inside a `%%` comment is no longer counted.

  `%%` / `- [ ] Hidden task` / `- [x] Also hidden` / `%%` reports no list item in Obsidian
  and reported two here. The link, tag and block collectors already skipped comment bodies;
  the list-item walk is a separate pass and did not.

- 57cdede: A lone carriage return ends a line when positions are rebuilt.

  `a\rb\r` keeps its two-line positions, where every point had been collapsed onto line 1.

- 795e790: Let a tab continue a footnote definition where four columns would not.

  A definition's later blocks have to be indented, and inside a quote the marker
  eats part of that budget: `>` then a tab lands short of four columns, so
  CommonMark ends the definition and starts a sibling beside it. Obsidian keeps
  reading, and `remark-footnotes` agrees — measured on the legacy stack, which
  puts the line inside the definition as a second paragraph.

  The difference is visible rather than structural. A definition's body renders
  in the footnote list at the end of the note, so a block left outside it shows
  up inline instead, as text Obsidian never puts there. One corpus case.

- eb0fefe: Fold a footnote definition into the prose above it inside any block container.

  A definition may not interrupt a paragraph, which this package already handled at
  the top level and under a list item. The same is true inside a quote, a callout
  and a nested item, so `> para` / `> [^q]: quoted under prose` is one paragraph to
  Obsidian where we reported a paragraph plus a definition — and the difference is
  visible, because a definition renders in the footnote list rather than inline.

  The pass now walks into every block container and resolves a quote or callout
  host to its own trailing paragraph, the way it already did for a list. Seven
  corpus cases, from several fixture families that looked unrelated by edit shape.

- a5b2b12: Require a table's header and delimiter to agree on the leading pipe.

  GFM does not care, and builds a table from `| a |` over ` | --- |`. Obsidian
  requires the rows to be written the same way and decides that on the row's
  very first character, so one leading space means "no pipe": both
  ` | a |` / `| --- |` and `| a |` / ` | --- |` are ordinary paragraphs.

  Two details are measured rather than assumed. The check reads the header from
  the start of its line, because remark begins a table after up to three
  leading spaces and slicing at the node's own offset discards the character
  the rule is about. And it applies at root only: inside a container every line
  but the first carries a `> ` or an indent, which is indistinguishable here
  from the leading space that means "no pipe", and treating them alike demoted
  callout tables Obsidian builds.

  Also completes the `%%` opener rule in the flow tokenizer, so `%% 50%` and
  `%%%` are paragraphs there too. Four cases from the author's list move to
  matching.

- 755ed67: Take the column count of a short delimiter row from the delimiter.

  `| a | b |` over `| --- |` built a table whose `align` followed the header, so
  it declared two columns. Obsidian renders `a` alone, measured through a real
  Reading View rather than the detached renderer the recorder batches — both
  agree, which contradicts the note previously attached to this case.

  `align` now follows the delimiter, which is what declares the columns. The
  surplus cell stays in the tree, so a rewrite can still restore it; it is
  dropped only when rendering, the same split the undefined footnote reference
  uses.

- 9aa5242: A list marker followed by a tab and up to three spaces still opens a footnote definition.

  `-` then a tab then two spaces then `[^Note]: def` is a definition at column 2 in Obsidian.
  This package read the item's content as indented code, so nothing was defined and the
  reference to it dangled. A tab plus four spaces is code on both sides and is unchanged, as is
  a wide `10.` marker, which never crossed the threshold.

  Restricted to items at the top level: an equally indented marker nested inside another item
  defines nothing in Obsidian, which the probes confirm.

  Referee agreement 5827 to 5829 of 6818 documents, the code-range dimension unchanged at 742 of
  883, and no corpus regressions.

- 2a53de6: The marker-plus-tab definition rule now covers every separator width and indented markers.

  `+` tab three spaces `[^1]: def` and `   -` tab two spaces `[^1]: def` are definitions in
  Obsidian. The rule shipped for this family only reached the narrowest separator, because the
  code node it re-parses keeps whatever indent exceeded the four columns stripped from it — so
  its value arrives as `" [^1]: def"` with a leading space for every wider separator.

  `probe/def-tab/marker-tab-spaces` has been a known gap since the tab family was first explored
  and now matches.

  Referee agreement 5844 to 5851 of 6818 documents, the code-range dimension unchanged, and no
  corpus regressions.

- c5a32da: Stop absorbing an unclosed `$$` opener into a blockquote or callout. A list takes the opener
  in as its own content, but a quote does not: `> quote` / `$$` reports a `blockquote` and then
  a ROOT `math` node. Restricting the absorption to lists fixes eight three-element
  compositions and one pair.
- 8ecbfaf: An inline math closer may not sit straight after a space.

  `$. $` renders literally in Obsidian where `$.$` is math, so the content may no more end in
  whitespace than begin with it. `$$ $$` and `$a b$` are unaffected.

- 6b90d64: Two display-math boundary rules.

  A `$$` at the end of a callout title opens no block: the title is one line, so nothing can
  follow the opener and nothing can close it, and `> [!note] $$` renders the literal `$$`.

  And a column-zero `$$` after a container whose last block is not a paragraph is its own
  block rather than a lazy continuation -- `> <br>` over `$$⇥[` is a blockquote _and_ a
  math, because the `<br>` closed the only block a lazy line could have joined.

- f55b502: Display math closing on a content line ends at that content.

  `$$` / `Math$$` ends at the end of its second line rather than carrying on past the line
  ending.

- 771d8f5: A demoted display-math block is wrapped in a paragraph.

  An unclosed `$$` inside a quote, callout, list item or footnote definition became a bare
  text node directly inside that container, where mdast requires flow content.

- f8139ce: A demoted display-math block no longer keeps its trailing line ending.

  Its span ran through the ending after the block, which is right for a flow node and wrong
  for the text replacing it, so the result reached past its own container.

- 26b4fa1: Display math inside emphasis is recognised when it spans a line ending.

  `_$$y^2` over `y^2$$_` is one display math inside an emphasis in Obsidian. A legacy wrapper
  must emit every line ending as its own token, so the span could not cross one and arrived as
  two text nodes and a `break`. The paragraph is now re-tokenized through the existing refold
  pass, which already replaces line endings with spaces length-preservingly for the same
  reason on highlights.

- 739c231: Delimit a display-math block the way Obsidian does

  Obsidian parses with `remark-math@3`, whose block tokenizer is not the
  code-fence template `micromark-extension-math` follows. The two disagreed about
  what the formula _is_, and three rules were read from that tokenizer's source
  rather than inferred from samples:

  - The opener's remainder is the body's **first line**, not an info string, so
    `$$x^2` is the formula `x^2` where the fence template left the body empty and
    put `x^2` in `meta`.
  - A closing `$$` **need not be alone on its line**. It closes when the first `$`
    on the line begins its trailing run, so `$$\nMath$$` is the formula `Math`
    rather than `Math$$`. A backslash does not escape it.
  - Only **spaces** are skipped after the opening fence, never tabs, so `$$\t[` is
    the formula `\t[`. The repair reads the source for this reason: `meta` has
    already lost the tab.

  The body is read with each line's containers removed, via the `lineOffsets`
  table, because `remark-parse@8` strips a quote marker or list indent before its
  tokenizer sees the line. Without that a quoted formula gained a `> ` and the
  serialiser nested it one level deeper on every formatting pass.

  Eleven cases moved from the parity backlog to matching. A same-line `$$x^2$$`
  still diverges: the real tokenizer refuses the block outright, since a `$` in
  the opener's remainder voids it, and the inline tokenizer produces display math
  instead. That needs re-tokenizing rather than repair, so it stays tracked.

- ba972ef: Indented display math keeps the separator after it.

  `$$y^2$$` over `word` renders `⟨math⟩word` with no separator, but `··$$y^2$$` over `··[[`
  renders `⟨math⟩ [[`. The suppression now applies only to display math beginning in
  column 1, where the rendered element really is block-level.

- c3a9cd4: A `%%` or `<!--` inside math opens nothing.

  `$$ … $$` is TeX, not markdown, so a region marker inside it is literal text — the same reason
  code spans and fenced code were already shielded from the region scanners. Math was missing from
  that set, which let the HTML-comment rebuild cut a math node in half, exactly as it cut `%%`
  comment nodes before comment spans were added:

  ```
  $$
  Some words <!-- x -->
  $$
  [^a]: def
  ```

  Obsidian defines `a` here; we lost it. The inverse also occurred — a reference invented inside
  `<!-- [^name] -->` when that comment sat inside math.

  Differential harness: 6133 → 6142 of 6818 documents with no regressions.

- d3ac800: A blank line bounds an unclosed `$$` that a list absorbs. `- item` / `$$` / blank /
  `use[^1]` reports the list ending at the opener and a live paragraph below in Obsidian; the
  formula was swallowing the rest of the note, losing a `footnoteReference` out of the tree.
  Scoped by two measured guards: the opener must directly follow a list, and what follows the
  blank line must be at column zero, since an indented line continues the item instead.
- 7a40859: An unclosed `$$` after a list or callout marker stays literal too.

  `- $$y`, `1. $$y^2`, `- [ ] $$y^` and `> [!note] $$y` all render the literal `$$…` in
  Obsidian with no formula. The container rule tested its prefix for whitespace and `>` only,
  so a list or callout marker fell through it.

- 547e724: Two fixes for content a transform or a projection had flattened.

  A leftover run after a relabelled link is re-parsed instead of being pushed as one
  literal text node, so a `<br>` after a link is html again rather than visible text. Its
  leading whitespace is held back and given its own span, since a paragraph drops it.

  And the parity harness now entity-encodes a no-break space inside a formula, which is how
  Obsidian reports `data-latex` -- the raw character was also being removed by the
  comparison's trim before the two sides ever met.

- 4f44c99: An inline `$` opener may be followed by a line ending.

  `x^2$` over `y^2$$]]` is an inline formula holding `⏎y^2` in Obsidian: the opener ends its
  line, the span crosses the ending, and the closer is the _first_ `$` of the `$$` run,
  leaving `$]]` literal. Refusing on every whitespace left the whole run as plain text.

- 51aceb8: An unclosed `$$` indented into a container stays literal text.

  `> $$y^2` is a blockquote whose rendered text is the literal `$$y^2` with no formula at
  all, and the same holds for a tab-indented `$$y` under a task. Close the run and it is math
  again, and an opener alone on its line still opens one — `> $$` over a lazy line is math
  holding that line.

- f58b3f2: A dollar that cannot close an inline span is content, not the end of the attempt.

  A single-dollar closer may not sit straight after a space, and the scan now goes on to
  look for one that can: `$$$], $x^2$` is one span holding `], $x^2`. Abandoning at the
  unusable closer let the interior dollar open a span of its own. `$. $` is still literal --
  it runs out of input rather than giving up early.

- c1ce113: Consecutive indented code lines are one block, not two.

  Micromark splits a run of indented lines into separate `code` nodes when a quote carrying a
  heading sits above them, where CommonMark and Obsidian both read a single block:

  ```
      a /     b                         one block
  > q / blank /     a /     b           one block
  > [!note] / > # h /     a /     b     micromark: TWO -- the split
  ```

  The divergence is upstream and not introduced here: bare `remark-parse` + `remark-gfm` reports
  the identical pair on every document measured. CommonMark has no mechanism that would split two
  consecutive indented chunks, so this is a correction both of this package's targets want rather
  than a preset divergence, and it is therefore ungated.

  Adjacent root-level `code` nodes on contiguous lines are merged. Fenced blocks are excluded --
  two in a row are legitimately separate, and a fence cannot be told from an indented block by its
  node, since an info-string-less fence also carries `lang: null`, so the opening line is read from
  the source. Strictly contiguous, which is narrower than CommonMark's own rule that a blank line
  inside indented code also belongs to the block; that widening is unmeasured and deliberately not
  taken.

  Obsidian's own code-block ranges move from 814/883 to 826/883 agreeing, with the footnote
  dimension unchanged at 5994/6818 and no corpus regressions.

- b92c093: Compare `metadataCache`, the oracle that was recorded but never read.

  Every golden carried Obsidian's own `metadataCache` view — headings, links,
  embeds, tags, footnote refs — and nothing compared it. It is independent of
  the DOM, built from Obsidian's parse rather than from what the renderer
  produced, so it sees what a text projection cannot: a link inside a footnote
  definition nothing references, a heading the view never paints.

  Turning it on finds 26 divergences across 1531 cases that every other
  projection agreed on, in five areas: a trailing `#` in a wikilink target, an
  escaped `#` inside one, an embed whose alias contains a wikilink, purely
  numeric and empty-segment tag paths, and several heading-recognition cases
  around tabs and comments.

  `projectMdast` grows an opt-out for its unreferenced-definition skip, which is
  right for rendered text and wrong for a source index.

- f6ffa27: A footnote label may hold a no-break space, and a block identifier may sit on a
  paragraph's first line.

  `\s` matches U+00A0, so the three label patterns silently excluded it and `[^~~ ~~]` was
  not read as a reference -- the same trap as `\w` quietly meaning "and underscore". ASCII
  whitespace is now written out.

  And `*^blk*` over `next` renders just `next`: the host walk only looked at the paragraph's
  last segment. Wrapped identifiers only, since an unwrapped `^blk` over `para` keeps its
  text.

- 50c61ad: Harvest a second sweep, and fix the id collision it exposed.

  176 more minimal cases from 400 fresh seeds: 213 disagreements reduced to 188
  distinct causes, of which 30 already matched thanks to fixes that landed while
  the sweep ran.

  The harvest had a real bug, and the way it hid is the interesting part. It
  numbered cases from one on every run, so a second sweep collided with the
  first — and `buildCorpus` deduplicates by markdown, so the case count looked
  correct while the recorder, which keys its output by id, silently overwrote
  174 cases and took their triage with them. Only the recorder's own
  "captured N of M" check noticed. Harvest now continues each category's
  numbering, and a test asserts corpus ids are unique so the next one cannot
  hide.

  The Reading View cross-check also no longer aborts on a document it cannot
  open. `u)[[$[^]$]]` never mounts a leaf, which is a property of the viewer
  rather than the parse, and failing the whole sweep over it threw away the
  cross-check for every other case. Such cases are now reported and skipped.

- 0280b3f: Let an unclosed fence inside a list item keep consuming, as Obsidian's parser does.

  CommonMark closes an unterminated fenced code block at the end of its container,
  so `- ```` ``` ````, ` code`, `plain`ends the list item and starts a paragraph.
Obsidian leaves the fence open and swallows the lazy line as code. That matters
beyond block shape: code is literal, so a`[^1]` inside it stays written instead of
  being read as a footnote reference and reduced to a bare name.

  Only a sibling starting at column 1 is absorbed. An indented child belongs to the
  list item on either reading, and taking it would corrupt ordinary nested content;
  a lazy continuation is unindented by definition. Four corpus cases.

- e1c1141: Lift a column-zero `%%` out of NESTED containers too. `> > quote` / `%%` and `- - item` / `%%`
  put the comment in the inner container, where a one-level lookup found nothing and it stayed
  buried. Every ancestor now shrinks, deepest first, so no outer span keeps covering a line it
  no longer owns.
- 938fd9c: A nested footnote definition does not absorb an unindented block opener.

  `- [^1]: def` over `%%` ends the definition on its own line, as does a heading, fence or
  further definition at column 0, since those sit outside the list item.

- 868fb08: A nested list item reports its parent's content column.

  `- Item one` over `    - Nested item` is reported at column 2 by Obsidian, not at the
  marker's column 4. A same-line re-parse and a tab-indented child keep their own column.

- 4c12efd: Hand a nested quote's last lazy line to a setext underline, as a single-level quote already
  did. `> > quote` / `title` / `===` reports a root heading in Obsidian at any depth; the pass
  looked for the trailing paragraph only among the outer quote's own children, found the inner
  quote there, and declined. The quote-marker strip now removes a run rather than one marker.
- 49c58c4: A nested list stops nesting when its parent item carries a later block.

  `- a` over `  - b` over a blank line over `  c` reports both items flat, while the same
  document with `c` indented four spaces keeps the nesting.

- 00b1109: Split a footnote definition inside a quote, not just at the document level.

  A definition's lazy continuation swallows a table or a setext-underlined
  heading that follows it, and the pass that undid this only walked the
  document's own children. Inside a quote the same shape went unsplit, so
  `> [^1]: body` / `> a | b` / `> --- | ---` reported one definition where
  Obsidian reports a definition and a table.

  The obstacle was positions rather than detection. A slice taken inside a quote
  carries `> ` on every continuation line, so it cannot be matched against block
  patterns or re-parsed as-is — and removing the prefixes shortens the text by a
  different amount on each line, which makes the usual shift-by-a-constant wrong
  the moment a block spans more than one.

  `src/lib/line-map.ts` keeps the de-prefixed text alongside the absolute offset
  and line number each line really started at, so a fragment parsed from it can
  be placed back exactly. The split now runs on that map and both halves are
  restored through it. Two corpus cases, and the mapper is reusable by any other
  pass that needs to re-parse a slice out of a container.

- 4bb6bd0: Require a setext underline to stand alone, as `remark-parse@8` does.

  CommonMark allows up to three spaces of indent before the run and any
  whitespace after it. remark-parse@8 allows neither, so `H` over `  ===` and
  `para` over `===⇥` are plain paragraphs to Obsidian where we reported headings.
  Measured against the legacy stack, every variant agrees: a leading space, a
  trailing space and a trailing tab each cancel the heading.

  Demoting matters beyond the heading itself. A definition on the next line
  cannot interrupt a paragraph, so once the heading is prose again the definition
  folds into it — which is how `H` / `  ===` / `[^1]: real` becomes the single
  paragraph Obsidian reports, rather than a heading plus a definition whose body
  would render in the wrong place.

  Two corpus cases.

- c2d02c8: Make a fuzz sweep report causes instead of seeds.

  A sweep that names seeds hands over work rather than findings. Raw failures do
  not group — a generated document carries six to eight constructs, so grouping
  94 of them by diverging projection and construct gave 90 classes and 86
  singletons, which is no grouping at all.

  Shrinking first is what turns a flood into a backlog. Every failure is reduced
  to the smallest document that still disagrees, and the reduced form is the
  dedup key: two seeds that shrink to the same text are the same bug however
  differently they started. Candidates for every failure are pooled into one
  recording per round, so shrinking twenty documents costs about what shrinking
  one did.

  On a 40-seed trial, 20 failures reduced from an average of 200 characters to
  24 — `"^blk\n"` at five characters, and `"| a \n| --- \n"` found independently
  from two seeds, which is the trailing-space table bug already known by hand.

  Two honest notes. Round caps matter: a four-round cap was still shrinking 16
  of 20 documents when it ran out, and unreduced leftovers are exactly what
  fails to deduplicate; it now runs to convergence. And the dedup factor is only
  about 1.05x even so, because the divergence surface is genuinely wide rather
  than a few causes repeated — so the value here is the minimal cases, not the
  grouping.

- bfc2488: Build a table of the delimiter row's width when it is shorter than the header.

  GFM requires the two rows to have the same number of cells and builds nothing
  when they differ, so `| a | b |` over `| --- |` is a paragraph. Obsidian builds
  a one-column table and drops the surplus header cell, rendering just `a`.

  There is no tokenizer to port: measured directly, `remark-parse@8` renders both
  cells, so it agrees with neither. Like the body-row pipe rule beside it, this
  comes from recorded output — Obsidian's table handling is its own code.

  Only a mismatch is handled. Equal counts already build a table upstream, so a
  paragraph still holding one means something else declined it, and guessing
  there would be wrong.

  One corpus case.

- d87cb86: Give a callout's title and body the spans they actually occupy.

  Promoting a blockquote into a callout consumed `[!note] ` off the front of the
  first text node and moved the title into `calloutTitle`, but left every
  position where it was. The body paragraph went on claiming
  `[!note] Title\n> Body` while holding only `Body`, and `calloutTitle` carried
  no position at all, so a consumer splicing by position would overwrite the
  title with the body.

  Both now match their content, including a callout nested in a list item, where
  the continuation prefix is ` >` and the body's start has to be read from the
  source rather than counted in the text value.

  No change to parsing or to any projection: Obsidian parity holds at 1135/1141.

- b88774a: Add seeded differential fuzzing against real Obsidian.

  The corpus can only contain what someone thought to ask, and the generated
  layers cross each construct against each context and adjacency — exhaustive
  two-way coverage that is blind to anything needing three constructs to
  interact. Exhausting the input space is not possible, so this takes the other
  approach: compose known fragments at random depth and order, sweep a seed
  range against Obsidian, and report which seeds disagree.

  Generation is deterministic from a 32-bit seed, which is the point. A failure
  is a number, not a snapshot: `generate(n)` reproduces the document on any
  machine, and promoting it into the permanent corpus is a copy and paste.

  Random bytes would be useless against a Markdown parser — they essentially
  never land on a delimiter boundary — so the generator works from real
  delimiter pairs, real containers and eight ways of breaking a pair.

  A nightly workflow sweeps a fresh random seed base, fails loudly, uploads the
  recording and opens an issue naming the seeds. The first 200-seed sweep found
  95 disagreements, concentrated on setext underlines at 2.1x the rate they
  appear in passing documents.

- 08dadea: Keep every header cell when a delimiter row runs short.

  The transform that builds a table from `| a | b |` over `| --- |` truncated it
  to the delimiter's width, producing one column. That matched the golden, and
  the golden was wrong: a full-corpus sweep against a real Reading View shows
  Obsidian renders **two** cells. The delimiter supplies alignment; running
  short does not drop a column.

  The detached renderer the recorder uses drops a row's surplus cells, a
  rendering difference the harness already documents for two other over-long
  rows. Matching it here would have cost a cell outright — a formatter reading
  our tree would rewrite `| a | b |` as a one-column table and lose `b`, which
  is the kind of silent loss this package exists to prevent.

  `hunt/table-delimiter-cell-count/0` is therefore re-triaged from `match` to
  `replicate`, with a note on the golden recording why it cannot be matched. It
  is a case where the measurement is wrong rather than the parser.

- c765d20: Keep an ordered list that cannot interrupt a paragraph inside the footnote
  definition above it.

  CommonMark only lets an ordered list interrupt a paragraph when it starts at
  `1.`, so `[^1]: body` followed by `2. item text` is lazy continuation of the
  definition rather than a list beside it. micromark applies that rule to ordinary
  paragraphs but still closes a footnote definition at the marker.

  The difference is visible rather than structural: a definition's body renders in
  the footnote list at the end of the note, while a list beside it renders inline,
  so the text appeared twice over. A list starting at `1.` still ends the
  definition, because that one can interrupt. Two corpus cases.

- f16f273: Open a code block for an indented line below a quote.

  CommonMark cannot start indented code inside a paragraph, so `> quote` /
  `> more` / `    code` reads the third line as more of the quoted paragraph.
  Obsidian ends the quote there and opens a code block. That changes what the text
  means rather than only its shape: code is literal, so a `[^1]` inside stays
  written instead of being read as a footnote reference. Two corpus cases.

- 6f4b5cd: Revive a footnote reference whose definition was recovered from inside a comment.

  `bareFootnoteRefTransform` reduced every unresolved `[^name]` in a text node to its
  bare name, on the reasoning that GFM has already turned any resolvable reference
  into a `footnoteReference` node. That stopped being true once the comment
  transforms started re-inserting definitions: GFM binds references while the
  definition is still hidden inside a `%%` comment, so by the time
  `commentTailTransform` puts `[^1]: def` back, the reference is still sitting in a
  text node and was being flattened. Obsidian shows a live reference there.

  Each match is now routed on whether the tree defines it — defined becomes a real
  `footnoteReference`, undefined is reduced as before. Four corpus cases, all shapes
  where the definition trails a comment closer or arrives later than the reference.

- 6765633: Parse `*` and `_` the way Obsidian does, behind a new `legacyEmphasis` option that
  is on by default.

  Obsidian runs stock `remark-parse@8.0.3`, whose emphasis and strong tokenizers
  predate CommonMark's delimiter-run and flanking algorithm. The two disagree on
  every unbalanced run, and the differences are not cosmetic:

  - `***a**` is `<strong>*a</strong>`, not `*<strong>a</strong>` — the surplus
    delimiter lands inside the span.
  - `*text**`, `*a***` and `**a\**` produce no emphasis at all.
  - `***a***` nests strong outside emphasis, inverting CommonMark.
  - `a * b * c` emphasises `b`; flanking is not applied, so asterisks in ordinary
    prose get consumed.
  - `**a **b** c**` yields two sibling spans where CommonMark yields one nested in
    another, so the emphasised text differs, not just the tree shape.

  `src/lib/syntax/legacy-emphasis.ts` is a verbatim port of the two legacy
  tokenizers rather than a reimplementation of their observable behaviour. That
  distinction is load-bearing: the output is not summarisable by a rule — the legacy
  loop reads two characters ahead while advancing one, so a character can be
  appended to the output buffer twice — and an approximation matches the easy shapes
  while missing `*****a*****`, `****a****` and the escape cases.

  Two details were needed to host that algorithm inside micromark, which consumes
  irreversibly where legacy could rescan:

  - The remaining chunk is materialised through a `check` partial so the ported
    function can run on a plain string before anything is consumed. Its consumes sit
    inside an open token, without which micromark's token stack desynchronises when
    `check` restores.
  - When no match is found the marker is emitted as literal data rather than
    rejected. A rejection hands the marker back to micromark's core attention
    resolver, which then builds emphasis the legacy algorithm never produces.

  Whitespace at the end of a span is emitted as data for the same class of reason:
  micromark reads a trailing run in a `text` chunk as a line suffix and drops it.
  CommonMark emphasis can never end in whitespace so core attention never hits this,
  but legacy emphasis can, as in `a* b *c`.

  Measured against the parity corpus this closes all 26 recorded emphasis
  divergences, taking it from 1006 to 1032 of 1122 cases with no regressions. Set
  `legacyEmphasis: false` to restore micromark's CommonMark attention.

  One cost is worth stating, because it is a property of the approach rather than
  of this implementation. Legacy rescans from each marker, so the work is
  proportional to markers times the length of the enclosing paragraph. The scan is
  bounded by the paragraph and not the document, which keeps realistic notes cheap
  — a 193KB note of ordinary prose parses in 171ms against 159ms for CommonMark
  attention, and a 19KB note in 36ms against 18ms. A single very long paragraph
  densely packed with delimiters is the shape that suffers: 400 emphasis spans in
  one 6KB paragraph takes 104ms against 4ms. Caching the materialised chunk would
  remove this, but the obvious key — source offset — is wrong wherever a tab or a
  virtual space makes offsets and characters disagree, so it is left undone rather
  than done subtly wrong.

- 850e0f3: Re-tokenize a paragraph the block folds rewrote.

  Inline tokenizing happens once, while parsing. A fold that later pulls a
  definition label or a setext underline into a paragraph inserts text the
  tokenizer never saw, so a delimiter inside it stayed literal: `para` /
  `[^1]: a` / `===` / `[^2]: b` / `===` is one paragraph to Obsidian, which
  highlights across the two `===` runs, while we kept them as text.

  The paragraph's own source is re-parsed with its line endings replaced by
  spaces, which forces a single paragraph — no setext underline, no definition —
  so the tokenizer sees the whole run as inline content. The substitution is
  length-preserving, so every offset still indexes the real source and each text
  node is restored to the characters it actually covers, newlines included.

  Only a paragraph where this produces a highlight that was not already there is
  replaced, so the pass is inert everywhere else.

  Also makes the highlight projection read an undefined footnote reference as
  its bare label, matching the rendered text it is compared against.

- 1e6c00e: Promote prose `remark-parse@8` would have read as a link reference definition.

  The mirror of the pass added alongside it. A label may contain a nested `[`,
  because the scan breaks only on `]`, so `[a[b]: /url` is a definition to
  Obsidian while CommonMark leaves it as text. The two passes never collide: one
  fires only where the port accepts, the other only where it rejects.

  The port now returns the span it consumed along with the identifier, URL and
  title, so the definition node can be built from what legacy actually parsed
  rather than re-parsed through a tokenizer that disagrees with it. One corpus
  case.

- fd882d1: Let a footnote definition recovered from a comment tail read the line below it.

  The tail after a closing `%%` is parsed on its own, so a definition found there
  ended where that line did. Obsidian treats it as a definition written normally, so
  `%%`/`hidden`/`%%[^1]: def` followed by `text` is one definition holding both
  lines. Without the lazy continuation the second line stayed a paragraph and
  rendered in the body, where Obsidian shows nothing at all. Two corpus cases.

- 27fcf21: Reach a `$$` opener inside a footnote definition nested in a quote.

  The container rule added alongside this only matched a paragraph and an empty
  `math` sitting in one child list. A definition inside a quote splits them: the
  definition holds the paragraph while the `math` is the definition's sibling, so
  the pair was never seen and the block stayed outside.

  Placement is the point, not just structure. Obsidian puts the block inside the
  definition, and an unreferenced definition is never rendered — so the formula
  and its text disappear from the note entirely. Leaving the block outside
  rendered content Obsidian does not show.

  Two corpus cases, including `quoted-orphan-region-split/1`, which has been
  outstanding since the hunt corpus was imported.

- 806c41a: One raw tab is a whole indent, in the legacy preset.

  `remark-parse@8`, which Obsidian parses with, reads a leading tab as four columns outright.
  micromark expands it to the next tab stop instead, so the same tab is worth fewer columns the
  further into a line it starts. Behind a quote marker the shortfall is exactly one column: `>⇥Text`
  yields three indentation codes where indented code needs four, so the content became a paragraph
  rather than a code block — and a paragraph absorbs the following unquoted line, which silently ate
  a column-0 footnote definition below it.

  Three places had to agree about the tab for that to come right. `legacyBlockQuoteSyntax` now
  spends only a space as the marker's padding, so the tab reaches the quote's content;
  `legacyIndentedCodeSyntax` reads one raw tab plus the virtual spaces it generated as a whole
  indent; and `legacyFootnoteDefinitionSyntax` accepts the same run as a definition's continuation,
  so a tab line under a definition continues it instead of becoming code. Applying only the first
  two traded 28 documents for 32 — the definition's container closed first and flow then claimed its
  continuation line.

  Measured against live Obsidian 1.15.0: `>⇥Text` is a code block, `>⇥⇥Text` keeps the second tab
  verbatim where CommonMark would leave two spaces, and `>⇥<!--` is code rather than an HTML block.
  The space rows are plain CommonMark and are unchanged, which is why this sits behind the legacy
  preset. Differential harness: 6029 → 6066 of 6818 documents.

- ac2c5b8: A quoted definition now continues over an ordered item that cannot interrupt it.

  `> [^1]: magna` followed by `> 2. item` is one definition spanning both lines in Obsidian.
  CommonMark lets an ordered item interrupt a paragraph only when its number is 1, so `2.` opens
  nothing here and the line is ordinary continuation — the same principle already recorded for a
  callout, reaching a definition inside a quote.

  A grid of three hosts against eight followers says it is only that host and only those markers:
  root and list-item hosts agree on all eight, and the quote host diverged on exactly `2.`, `10.`
  and `2)`. The five that already agreed are what make this the interrupt rule rather than a fact
  about ordered markers — `1.` and `1)` can interrupt, both bullets can, and all five end the
  definition on both sides.

- a80395a: A tab-indented definition under an ordered host counts the spaces after the tab.

  `definition-column.ts` short-circuited an all-whitespace prefix beginning with a tab to the NUMBER
  OF TABS, discarding both the spaces after it and the host's content column. Under an ordered host
  that is too coarse — the column moves with what follows the tab, and all three spellings have a tab
  run of one:

  ```
  host "  1.<5sp>More"    <TAB> 1   <TAB><1sp> 2   <TAB><4sp> 3
  host "  *<5sp>More"      <TAB> 1   <TAB><1sp> 1   <TAB><4sp> none
  host "1.<5sp>More"       <TAB> 1   <TAB><1sp> 1   <TAB><4sp> none
  ```

  `min(tabRun + spacesAfterTabs, hostIndent + 1)` produces exactly 1, 2 and 3, and scoping it to an
  ordered host is what keeps every bullet row at 1 — including the branch's own control, `- p` over
  `<TAB><1sp>`, where the same two characters report 1.

  The `def-prefix-by-host` grid crosses the definition's prefix with the host and goes from 2
  diverging cells to 0 of 42. Footnote agreement moves from 6010/6818 to 6013/6818 with zero
  regressions, verified by comparing the agreeing sets by identity rather than by their totals.

- b35dafb: A numeric character reference with too many digits decodes to U+FFFD.

  `&#87654321;` renders as the replacement character in Obsidian. micromark caps a numeric
  reference at seven digits for decimal and six for hexadecimal and refuses anything longer,
  leaving it literal; the cap is on digits, not on the value, so `&#0;` and `&#x110000;`
  already decoded correctly.

- 4eef178: A percent escape in a link destination is decoded.

  `[link](foo%20b&auml;)` resolves to `foo bä`.

- 80ae712: Place the line separators that rebuilt paragraphs insert

  Five passes that fold lines back into a paragraph pushed a bare
  `{type: "text", value: "\n"}` for each line boundary, with no position —
  `setextUnderlineTransform`, `multilineSetextTransform`, `footnoteLabelTransform`,
  `tableInterruptTransform` and the definition tail in `commentTailTransform`. Two of
  them also pushed the line's own text unplaced when it did not reparse to a paragraph.

  `remark-breaks` then turned each unplaced separator into an unplaced `break`, so one
  missing position became two. Each site already tracked the offset it was walking, so
  the newline's span was available all along.

  Positionless nodes drop from 168 to 68, after the 1188 to 168 that positioned soft
  line endings. `paragraph > break` goes 67 to 7 and `paragraph > text` 17 to 10, with no
  corpus case changed.

- 4337fac: Place the rows and cells a promoted table builds

  `tableShortDelimiterTransform` constructs a `tableRow` and its `tableCell`s when a
  short delimiter row declares fewer columns than the header. It received only the line
  text, so none of those nodes could carry a span, and each cell's reparsed contents kept
  the offsets they came back with — numbered from the cell rather than the document, which
  is worse than no position because it still looks usable.

  It now receives the header's offset and derives each cell's span from the same split,
  shifting the reparsed contents onto the document.

  Positionless nodes 68 → 52, and both table entries in the ceiling reach zero.

- 3726aa0: Widen the fuzz generator where no seed count could reach.

  Measuring which constructs the generator can emit over 10,000 documents found
  two it could **never** produce — embed sizing and autolinks — and two more
  under 3%: wikilink aliases at 0.9% and heading targets at 2.8%. Those are
  precisely where the known divergences are, so the fuzzer was blindest exactly
  where it was needed.

  Seed count cannot fix a distribution. The second-field wikilink forms and the
  embed parameter forms are now listed explicitly rather than arising by
  accident through nesting, and autolinks exist in the grammar at all:

      wikilink alias   0.9% -> 57.8%      embed size   never -> 44.4%
      wikilink heading 2.8% -> 59.7%      autolink     never -> 22.0%

- a198220: Let a container absorb a math block opened on a lazy continuation line.

  A column-zero line below a list is lazy continuation, and a `$$` on it opens a
  block that belongs to the list rather than beside it — `- item` / `x $$` /
  `$$ tail` is one list to Obsidian. The absorb pass already took a paragraph, a
  definition and a table; a math block is the same case.

  A blank line still ends the container, so an ordinary `$$` block after a list
  stays its own node. One corpus case.

- f63b897: Clear the residue two earlier passes left behind.

  Both are the same shape of bug: a transform repaired the node it was aimed at
  and left a sibling artefact that nothing afterwards looked at.

  **References to a recovered definition.** The `frontmatter` × `gfm-footnote`
  mis-parse labels `[^1]: d` as a link reference definition named `^1`, so every
  `[^1]` elsewhere resolves against it and becomes a link reference rendering as
  `^1`. Converting the definition back left those pointing at something that no
  longer existed; they are now converted with it.

  **Quotes split by a lazy continuation.** A column-zero line inside a quote is
  lazy continuation and the `>` line below carries on the same quote, but a
  definition-shaped continuation ends the quote as a block of its own and the
  next `>` opens a second. Absorbing the continuation put the text back without
  rejoining the halves, so `> closing words` / `[^9]: orphan` / `> ---` reported
  two blockquotes. An immediately adjacent pair is now merged; a blank line
  between them still starts a new quote.

  Two corpus cases.

- 09863ca: Two rules settled by probing Obsidian directly.

  Frontmatter is reported whenever every quoted scalar shows its quote character twice,
  escaping ignored — not when a strict YAML parser accepts it, which is what `x: '1''`
  disproves. And a same-line list child nests only when its parent is a task, so
  `- [x] 1.` reports a nested item where `*\t*` reports two root ones.

- ed8c174: Adds a 46-case probe wave settling five families the backlog could not adjudicate, and
  records the two hypotheses it refuted. No behaviour change; corpus 3245 -> 3291.
- fb2a788: Re-recorded the goldens under the full reading-view cross-check and corrected the recorded
  causes of the last two open cases. Neither is a parse gap: one golden mixes projections
  captured from two different renderings, and the other is a recursive self-embed that needs
  vault resolution. No source change.
- 020415d: A node is no longer left with a negative span when a lazy setext underline takes its only
  line away. `> [!note] title` / `[^1]: def` / `---` produced a `footnoteDefinition` starting at
  offset 16 and ending at 15; the node is now dropped instead, which is also what Obsidian
  reports for it -- a definition absorbed as a container's lazy content is not a definition.
- c7a73fd: Keep `[^1]: x` a footnote definition when a `---` block precedes it.

  Registering `micromark-extension-frontmatter` alongside
  `micromark-extension-gfm-footnote` changes which construct wins, and the footnote
  definition starts losing to the link reference definition. On its own
  `[^Note]: alpha` is a `footnoteDefinition`; after any `---` it becomes a
  `definition` with `identifier: "^note"`, so the definition disappears and every
  reference to it goes unresolved. It reproduces with official `remark-frontmatter`
  in either registration order, so it is an upstream interaction rather than
  something this package introduced — worth filing separately.

  Converting back is safe rather than a guess: with GFM footnotes enabled a label
  opening with `^` is always a footnote definition, never a link reference. The
  body is rebuilt from source, because the mis-parse scattered it across the
  definition's `url` and `title`. Two corpus cases.

- 3d0eaf6: Compare the block attributes no projection read.

  `text` compares what a block says, never what it is. A table's column
  alignment, a fence's language and an ordered list's starting number all live
  in mdast fields nothing looked at — and that is not academic, since the
  delimiter row's column count was changed in this package with no projection
  able to catch an error in it.

  Obsidian's side comes from the HTML already stored in every golden, so this
  needs no re-recording. Agreement is 1528 of 1531, and the three that differ
  are real: `| :: |` builds a centred table in Obsidian and none here, and a
  tilde fence's info string is kept as a language here where Obsidian discards
  it.

  Getting there meant fixing four artifacts of the extractor rather than of the
  parser: the renderer appends footnote definitions as their own list, nests a
  second container for inline footnotes, paints frontmatter as a yaml fence, and
  falls back to `language-none` when an info string cannot be a class name.

- a164332: Keep scanning a highlight past a closer that would end in whitespace.

  The scanner rejected the whole attempt when the content was bounded by
  whitespace. That is right for leading whitespace — no later closer can repair
  it — but wrong for trailing: Obsidian carries on and may close further along.
  `===` / `[^2]: b` / `===` closes on the _last_ two markers, because stopping at
  the first leaves content ending in a newline, while taking the next `=` into
  it lands on a closer that does not.

  No corpus case moves today. The shape that exposed it needs the folded
  paragraph's inline content re-tokenized before the run is ever visible to a
  tokenizer, which is a larger change than one case warrants. The scanner is
  nonetheless wrong as written, and is tested directly.

- 8b59912: The indent that makes a line code inside a quote is read from the ancestry.

  A footnote definition continues at four spaces, so inside one code needs eight -- a rule
  the pass already had, but it asked the blockquote's immediate parent. With a quote nested
  in a quote that parent is a `blockquote`, so `[^1]: > > <ma` over
  `    target]]. [![[#tag]]](u)` had its continuation cut into code and the link and embed
  inside it went unindexed.

- 0f8445f: Measure a quote's indented-code threshold from its container, not column zero.

  A footnote definition continues at four spaces, so inside one those four are the
  continuation and code needs eight. `[^1]: > [!note` over `    [[target]]` is the quote's
  lazy continuation, and cutting it into a code block lost the wikilink Obsidian indexes.

- 8ad0000: A comment opened inside a quote is not closed by a marker outside it.

  `> %%` over `> x` over `%%` over `[^1]: def` defines nothing, where the unprefixed marker
  had been read as the comment's closer.

- a6d031e: An unclosed `%%` opened inside a quote two or more levels deep now swallows the lines below it,
  as Obsidian has it. A definition on one of those lines stops defining and its label is indexed
  as a reference, matching the asymmetry already applied to a comment at one level or at the
  document's root. A closed comment, and one followed by a blank line or any line that ends the
  quote, are untouched.
- 57fc959: Extend an unclosed `%%` to the end of the quote that opened it

  An opener with no closer already runs to the end of the note at the top level.
  Inside a quote it has to run to the end of the quote, and the quote's own lazy
  continuation makes one case look different — a following line with no marker is
  pulled into the quote, so the comment takes it:

  ```
  > %%            one blockquote, the comment holds `[^1]: def`,
  [^1]: def       and nothing is defined

  > %%            the blank line ends the quote, so the definition
                  below it is live
  [^1]: def
  ```

  Recorded against Obsidian 1.14.4 rather than reasoned. `%%` is Obsidian's own
  construct, so the legacy stack cannot arbitrate it the way it settles a tab or a
  fence — and inferring from pattern-matched corpus data had already produced a
  wrong rule once. Seven probes isolate the question; all seven now match.

  `> %%` / `> [^1]: def` already worked, since a marked line is plainly the quote's
  content. Only the unmarked continuation needed this.

- ce25233: A footnote definition in a blockquote starts at the quote's content column.

  `>  [^1]: def` and `>   [^1]: def` both start at column 2, where the extra padding
  belongs to the definition rather than moving its start.

- 0c75ed2: A quote does not absorb raw html at column zero; a list does.

  `- x` over `</div>` is one list in Obsidian, while `> x` over `</div>` is a blockquote
  **and** an html, exactly as `para` over `</div>` is. This rule was written from the list
  and the paragraph and applied to a quote as well, because they share one container set.

  `> x` over `<br>` is unaffected and still one blockquote.

- 474b0d8: A tab-indented line below a quote now ends the quote and opens a code block, as four spaces
  already did. `> x` over a tab-indented line reports a blockquote and a separate code block
  rather than one lazily-continued paragraph, matching Obsidian; the indentation had been measured
  in characters, where a tab is one character reaching four columns.
- 30ce96c: An indented paragraph inside a blockquote or callout is read as code.

  `> [!info]` over `>     dolor [^b]` keeps the reference literal, as Obsidian does, instead
  of indexing it.

- b3e27c5: A lazy line indented four columns under a root blockquote is now root indented code.

  `> quote` followed by an unquoted line at four or more columns is a blockquote and a separate
  code block in Obsidian, not one blockquote swallowing the line. We continued the quote, so a
  footnote definition or reference standing on that line was indexed when Obsidian indexes
  nothing there, and the code block it should have produced was missing from the document's
  block structure entirely.

  The predicate is four spaces or a leading tab. Eighteen follower indents were asked of the
  running application: nothing is code below four columns, everything from four upward is, and
  one to three spaces followed by a tab is not — the same asymmetry `definition-indented-code.ts`
  already carries, derived here independently from a different oracle.

  It applies to a quote starting at column 0 only. A quote nested in a list item or a definition
  produces no root code at any indent from zero to twelve, because its lazy line belongs to the
  container above it.

  Content after the code block is re-parsed rather than dropped. `> quote` / `> - item` /
  four spaces `lazy` / `> after` is a blockquote, a code block and a second blockquote in
  Obsidian — the marked line resumes a quote — so the lines the rule cuts away are rebuilt in
  place instead of being deleted with the rest.

  Found by a new composition axis that generates partially prefixed container bodies, which is a
  shape no existing sweep could express — the others prefix every line of the nested block.

- ae0ee9c: Read a tab after a quote marker as indentation

  `remark-parse@8`'s blockquote tokenizer consumes the `>` and then at most one
  **space**. A tab is not a space, so it survives into the quote's content and
  supplies a full indent -- four columns, which is an indented code block. Every
  construct behind such a marker is therefore code to Obsidian, not just the
  footnote definition that led here:

  ```
  >	plain text   -> code
  >	# heading    -> code
  >	- item       -> code
  >	[^1]: def    -> code
  ```

  micromark admits the tab as the marker's own whitespace instead and reads each
  line as the construct it looks like.

  Verified against the legacy stack Obsidian parses with -- `remark-parse@8` plus
  `remark-footnotes@2` -- which reports `blockquote > code` for all four, and
  against a recorded `computeMetadataAsync` answer: `>\t[^1]: def` is reported with
  no definition at all.

  Only a quote whose every content line is marked this way is rewritten; a mixture
  would need the lines regrouped into alternating code and prose, and guessing at
  that split is worse than leaving it recorded.

- 4d9e2bd: A list item nested inside a blockquote reports its parent's content column.

  `> - a` over `>    - b` reports column 4, where the quote prefix had hidden the parent's
  content column from the lookup.

- 787a6df: A tab following one to three spaces no longer counts as reaching the indented-code threshold
  below a quote, so `> x` over a two-space-then-tab line stays a lazily continued paragraph as
  Obsidian has it. Only a leading tab reaches the threshold, matching the asymmetry already
  applied to definitions.
- 068802c: A tab-marked definition converted to code inside a mixed quote now loses its quote marker like
  every other line, instead of leaving a stray `>` in the code's text, and merges with an
  adjacent converted block so the quote reports one code block rather than two.
- f940f60: A footnote definition behind a tab that follows a quote marker no longer defines, even when the
  quote also holds ordinary lines. The whole-quote case was already handled; a mixed quote now
  converts just the tab-indented definition to the indented code Obsidian reads it as. A
  definition separated from the marker by spaces still defines, and a tab-indented one defines
  once an earlier space-separated definition in the same quote has established its content
  column.
- d401a66: A `%%` comment opened inside a quote no longer closes past the blank line that ends the quote.

  An unquoted empty line ends a blockquote, so the quote below it is a new one — and a `%%` opened
  in the first cannot reach a closer in the second. We paired them anyway, so the region spanned
  both quotes and buried the definition between them:

  ```
  > %%

  > [^1]: def
  > %%
  ```

  Obsidian keeps `[^1]` live here. Rejecting that closer leaves the region unclosed, which is the
  right shape rather than a fallback: an unclosed comment inside a quote is already bounded to its
  quote, and that is exactly the extent Obsidian reports.

  Three controls keep the rule narrow, all measured against live 1.15.0. At the top level a blank
  line ends nothing — an unclosed `%%` runs to the end of the note, blank lines and all. A `>`-only
  line keeps its quote open, so the test is emptiness rather than blankness. And a list item with
  the same shape was already correct, so this is about quotes specifically, not containers in
  general.

  Differential harness: 6104 → 6116 of 6818 documents with no regressions, definitions 93.17% →
  93.36%.

- c19d019: A footnote definition inside a blockquote now ends at a line quoted more deeply than itself.

  `> [^1]: def` followed by `> > quoted` ran the definition over the nested line, so its span was
  too long and anything indexed there belonged to the wrong definition. A line at the same depth
  or shallower is unchanged, and a definition at the top level is unaffected.

  Referee agreement 5829 to 5841 of 6818 documents, the code-range dimension unchanged at 742 of
  883, and no corpus regressions.

- cc101eb: A quoted footnote definition now also ends at a quoted `>`, alongside the quoted list marker
  and quoted label it already ended at.

  Referee agreement 5796 to 5803 of 6818 documents, the code-range dimension unchanged, and no
  corpus regressions.

- 6c1bd3f: A footnote definition inside a blockquote now ends at a quoted list marker or a quoted label,
  as it already did at a quoted heading or fence.

  `> [^1]: def` followed by `> - item` or `> [^2]: two` ran the first definition over the second
  line, so its span was one line too long and anything indexed on that line belonged to the wrong
  definition. Obsidian ends it, exactly as it ends one at `> # head` or `> ```.

  Referee agreement 5767 to 5796 of 6818 documents, the code-range dimension unchanged at 742 of
  883, and no corpus regressions.

- 5b96700: A blank line ends a quoted fence, however far away its closer is.

  This corrects the rule shipped one commit earlier. A quoted fence runs to its quoted closer, so
  the quote absorbs the lines between rather than closing — but absorbing a BLANK line was wrong.
  Measured against live 1.15.0, with the quote/root asymmetry as the control:

      > ``` / > a / > [^b]: def / > ```        defs []      the fence holds
      > ``` / > a / BLANK / [^b]: def / > ```  defs ["b"]   the blank ENDED it
      > ``` / > a / BLANK / > [^b]: def / ...  defs ["b"]   even re-quoted, still ended
      ``` / a / BLANK / [^b]: def / ```        defs []      at ROOT a blank ends nothing

  The last row is why the guard belongs in the blockquote and not in the fence construct: a root
  fence spans its blank lines, so the rule is the QUOTE's. That is the same asymmetry already
  recorded for a `%%` region — an unquoted empty line ends a blockquote, while at root a blank
  terminates nothing.

  Found by `ablate` on the `MISSING inside our code` bucket, which named `legacyLists` decisive on
  11 documents at ratio 0.58. All three sampled reductions were the same shape — a blank line
  inside a quoted fence with Obsidian defining the label after it — which is precisely what the
  previous commit's blank-line absorption suppressed.

      referee 6158 -> 6163 / 6818   +5 GAINED, 0 LOST, by --ids identity
      6 oracle-verified rows match, including the previous commit's own target
      450 tests pass, 0 probes drifted, 4 gates green

- f956dd4: A quoted fence runs to its quoted closer, so labels between stay inside code.

  A fenced code block opened inside a blockquote is not ended by a following line that omits
  the `>`. Measured against live 1.15.0 -- the quoted closer is reached, the whole span is one
  code block, and the labels inside it are not references:

      >   ~~~ / Some words / > [^a]: def / >   ~~~     one code block, NO ref `a`
      > ```` / Text end. %% [^ch2*] %%  / > ````       one code block, NO ref `ch2*`

  Ours ended the block at the unquoted line, which left `> [^a]: def` outside it as ordinary
  quoted text and turned the label into a reference we invented.

  It is CONDITIONAL on a quoted closer existing. Where a quoted fence never reaches one,
  Obsidian ends the block with the quote and parses the rest of the note as ordinary flow --
  absorbing there cost 29 documents whose root definitions below the opener all went missing.
  That makes the condition a LOOKAHEAD, which is why it cannot live in the fence's own
  continuation and is enforced from the quote instead, through the chunk-scan-under-`check`
  idiom `legacy-scan.ts` already uses for the rescanning inline tokenizers.

  The quote ABSORBS the line rather than the fence tolerating it, which is the cheaper half of
  the design: because the continuation then succeeds, micromark never marks the line lazy, so
  stock's fence continuation is untouched and blank lines are carried for free. Tolerating lazy
  lines in the fence instead reaches list items too -- where an item's fence already runs too
  long rather than too short -- and cost 114 documents to gain 33.

  `legacyCodeFenced` borrows micromark's `codeFenced` whole and substitutes one call rather
  than forking ~300 lines of fence-length and info-string bookkeeping: its `tokenize` is
  invoked with the `effects` we build, and `effects.attempt` reaches exactly the closing fence.

      referee 6145 -> 6148 / 6818   +7 GAINED, 4 LOST, by --ids identity
      5 probe-ledger entries NOW AGREE with Obsidian; 0 moved away
      450 tests pass, 4 gates green

- 5bd60d0: A footnote definition on an unquoted line directly below a quoted fence opener no longer
  defines.

  `> ``` ` followed by `[^2]: def` puts that line inside the fence in Obsidian, so it is literal
  content and defines nothing. This package read it as a live definition, which also made the
  reference to it resolve.

  A quoted line below the opener was already handled, and a blank line before the unquoted one
  ends the quote so the content is live again — both are unchanged.

  Referee agreement 5803 to 5812 of 6818 documents, the code-range dimension unchanged at 742 of
  883, and no corpus regressions.

- a4e2154: A `$$` or an HTML opener inside a quote now swallows the unquoted label below it, as a fence
  already did, and it works at any quote depth.

  `> <div>` followed by `[^1]: def` reports no definition in Obsidian — the unquoted line is
  inside the HTML block, so the label is literal. The same holds for `<!--`, for `$$`, and for a
  fence at two levels of quoting, which the fence rule missed because it stripped a single quote
  marker rather than a run.

  Measured as a grid of eight openers against four hosts. A fence, a `$$` and an HTML opener all
  swallow; a `%%` and a plain line already agreed by other means; and a heading does **not**
  swallow, which is the negative that bounds the set — a heading ends the container instead of
  running past it.

  Extending the same rule to a list-marker host is deliberately not done. `- <div>` over `[^1]:`
  behaves identically in Obsidian, and admitting it costs 44 documents on the footnote oracle: a
  quote marks every line it owns, so "not quoted" means "outside the quote", while an item's
  content is bounded by indentation a line scan cannot see.

- 702c8c8: A quoted footnote definition no longer ends at a block opener separated from the quote marker
  by a TAB.

  `> [^1]: def` followed by `>` tab `- item` continues the definition in Obsidian: the tab puts
  the line's content four columns in, where it is indented code, so the marker is not opening a
  block. The quote prefix was consuming a tab as if it were the marker's space, which made the
  opener test fire.

  Every space separator is unchanged, as are a tab before a heading or a fence, which already
  continued on both sides.

  Referee agreement 5841 to 5844 of 6818 documents, the code-range dimension unchanged, and no
  corpus regressions.

- 0e775bb: A quote whose `[!type]` has a glued title is no longer treated as a callout.

  `quotedTabCodeTransform` suppresses a reference on a tab-indented line under a callout, which is
  correct and measured. Its own callout test stopped at the closing bracket:

      /^[ \t]*>[ \t]*\[![^\]]+\]/

  so it matched `> [!note]Title`. A1 requires EOL, a space or a tab after `[!type]` and its
  optional `+`/`-`, which `callout.ts:21` already enforces -- the glued spelling is a plain quote,
  and Obsidian indexes the reference on its tab line at column 6. The pattern now carries the
  same boundary.

      > [!note]Title / >⇥code[^2]    2@1:6   was none
      > [!note]      / >⇥code[^2]    none    unchanged
      > [!note] T    / >⇥code[^2]    none    unchanged
      > [!note]+     / >⇥code[^2]    none    unchanged
      > plain        / >⇥code[^2]    2@1:6   unchanged

      referee 6233 -> 6234 / 6818   +1 GAINED, 0 LOST

- bf9ca38: A footnote reference on a quoted tab line below an empty `>` is no longer indexed.

  `>` followed by `>` tab `code[^2]` is indented code to Obsidian, so the brackets are literal and
  no reference is reported. We indexed one. The same holds below a callout title, and the control
  that fixes the rule's shape is `> plain` followed by the same tab line — there the quote has an
  open paragraph, the tab line continues it lazily, and the reference **is** indexed.

  It does not apply while a footnote definition is still open above the blank quoted line. A
  definition continues across an empty `>`, so the tab line is its content rather than a fresh
  block, and Obsidian indexes the reference there — its own recorded definition span reaches the
  tab line, which is what settles it.

  The reference becomes literal text carrying its own characters rather than being removed, so a
  formatter rewriting the line cannot lose the brackets.

- b7330e4: End a footnote definition at a link reference definition.

  A definition's lazy continuation already stops in front of a table or a
  setext-underlined heading. A link reference definition is a block of its own
  too, so `[^1]: body` over `[foo]: /url` over `more` is three blocks to Obsidian
  where we reported one definition swallowing all of it — which hid `more` in the
  footnote list instead of rendering it.

  The check reuses the `remark-parse@8` port rather than a pattern: whether the
  remaining lines are a definition is exactly the question that port already
  answers, including the cases where its rules and CommonMark's disagree. One
  corpus case.

- 60c1090: A footnote reference immediately followed by a `[` is no longer swallowed into a link reference,
  so `a[^1][^2]` reports both references instead of none. Adjacent references were being parsed as
  one full link reference whenever the names were undefined; defined names were already correct. A
  `[` after ordinary link text still opens a label, so `a[text][^1]` is unchanged.
- e101d9b: A relabelled reference writes a decoded label, so formatting terminates.

  `labelPrecedenceTransform` built a `linkReference` whose `label` was the raw bracket scan,
  and `label` is the field handed to the escaper -- so `[bar][foo\!]` had its backslash
  escaped again on every format pass, doubling without bound. The label is now decoded while
  the `identifier` stays raw, which is the asymmetry Obsidian needs: decoding the identifier
  resolves the reference against `[foo!]` and turns a dangling reference into a link.

  With this, no corpus case grows without bound any more.

- dee9271: The inline refold no longer undoes the tokenizer's escape resolution.

  Refolding re-parses a paragraph against a copy whose newlines are spaces, then puts the
  real characters back. It did that by overwriting each text node's value with the raw
  source slice, which restores the line endings and discards everything else the tokenizer
  decided: `\*\* ` resolved to `** ` and was respelled with its backslashes, so every format
  pass escaped them again and the run doubled without bound.

  Now the raw slice and the value are walked together, so only a substituted line ending is
  taken back. Three more round-trip documents reach a fixed point, with no parity change.

- cf4ea50: Two ordering and whitespace fixes.

  A link inside an inline footnote is now indexed after every other link, which is where
  Obsidian puts it: the renderer relocates the footnote body to a trailing section and
  `metadataCache` follows, so an embed written earlier on the line is reported last.

  And a construct spanning a rebuilt line ending no longer keeps the continuation line's
  indentation. The block parser strips it before any inline tokenizer sees it, so `==a` over
  `··===` is the highlight `a⏎=` rather than `a⏎··=`.

- 699135f: Bound transform-chain recursion so a self-reproducing fragment cannot overflow the stack

  A pass that locates a body by matching a marker hands back the text it was given when
  the match fails, and the chain then re-enters itself on identical input.
  `taskReparseTransform` does exactly that for a nested task item whose paragraph
  already starts past its own marker.

  `reparse` assumed fragments only ever shrink and therefore needed no bound. They do
  not, and the result was a stack overflow — a crash, not a divergence. Found by
  sweeping the fuzz generator: **55 of 4000** generated documents threw
  `Maximum call stack size exceeded`, 37 frames deep.

  The depth is now bounded centrally, which covers all 19 passes that take a reparse
  callback rather than each guarding separately. At the bound the fragment is still
  parsed, just not transformed, so it stays well-formed.

  Verified at 0 crashes across 16000 generated documents, with no change to any corpus
  case.

- d824a3a: A failed definition line keeps its escapes resolved.

  `legacyDefinitionTransform` places the line it cannot read as a definition verbatim, so
  `[foo]: /url\bar\*baz "foo\"bar\baz"` rendered with its backslashes where Obsidian shows
  `\*` as `*` and `\"` as `"`. The escape set is backslash plus ASCII punctuation --
  confirmed against the arbiter, where `\b` stays and nine punctuation escapes resolve --
  and the resolver is now shared with the comment fold rather than duplicated.

- c7e1850: Nodes spliced without a position get one back.

  `mdast-util-gfm-autolink-literal` builds a `https://` link through
  `mdast-util-find-and-replace`, which leaves every node it splices with no position at
  all. Passes that need offsets then stand aside -- correctly, but it left
  `[^https://e.test/p]` unreachable. The span is tiled from what each child was written as,
  and the parent is abandoned untouched if that does not fit exactly.

- 70fe853: A root list item indented one to three spaces is reported at column 0.

  ` - a` is reported at column 0 by Obsidian, not at the marker's column 1 — the same
  line-start clamp already applied to sections and headings.

- 808cafe: A section's reported end is clamped to its content for container types.

  A list, footnote definition or paragraph whose mdast span runs past its content is now
  reported at the content, while an unclosed fence, html block, math span or comment keeps
  the end Obsidian reports for it.

- d6ff012: A list item's ownership threshold and its content column are now separate quantities.

  They differ for a capped single-digit-dot item: `1.` followed by five spaces consumes three
  columns of prefix, while its content column is four, because `1.` counts one more column than it
  occupies. One field was serving both roles, so every change that was right for one was wrong for
  the other.

  Ownership keeps the narrower number, which is what CommonMark requires — in `1.` five-spaces
  `indented code`, a blank, three-spaces `paragraph`, a blank, seven-spaces `more code`, the last
  line has to be four columns past the item's content and therefore code. The flow gets the wider
  one, so a footnote label seven columns in is three past the content column and stays a
  definition instead of being swallowed by an indented code block.

  The de-indentation minimum now applies to both: a line shallower than the content column lowers
  it, which is what lets those two cases coexist — the first has an intervening shallower line and
  the second does not.

- 43d4133: A setext underline's container indent is measured from the heading's offset.

  A heading moved by an earlier pass no longer has a stale column decide how much of its
  underline belongs to the container.

- ab96034: Measure a setext underline's indent from its container

  `remark-parse@8` allows no indent before a setext underline, which is why that pass
  demotes one. But the indent a list item puts in front of its _own_ underline belongs to
  the list — `- item` / `  ===` is a heading to CommonMark and to Obsidian, and demoting it
  on two spaces that were never sloppiness cost the heading outright.

  Only inside a container: at root an indented paragraph also starts past column one, so
  reading the indent off the heading alone made a heading of CommonMark's example 84, which
  is a paragraph.

- d79fcd9: A dash underline over a multi-line paragraph is a thematic break

  Obsidian makes a heading only from a single content line, which this package already
  reproduced — but it was folding the leftover underline into the paragraph as text.
  For a dash underline that is wrong: Obsidian reports a `paragraph` and a
  `thematicBreak`.

  | source        | Obsidian                      |
  | ------------- | ----------------------------- |
  | `a` `---`     | `heading` (h2)                |
  | `a` `b` `---` | `paragraph` + `thematicBreak` |
  | `a` `b` `===` | `paragraph`, `===` stays text |

  The asymmetry is real: `===` has no block form of its own, so it can only be text,
  and that case already matched.

  21 cases move from `replicate` to `match` with no regression.

- d6d7195: A blank line ends a footnote definition before a thematic break

  `setextDefinitionTransform` absorbs a `---` below a definition and makes a heading of the
  whole line. Its gap check used `trim()`, which a blank line passes — so `[^1]:` / blank /
  `---` became one heading spanning both, where Obsidian reports the definition and the
  thematic break as the separate blocks they are.

  An adjacent underline is still taken, which is the rule the pass exists for.

- d6102d0: A footnote definition under a bare `-` is now the setext heading Obsidian reports, not a
  definition followed by an empty list. A hyphen run with trailing whitespace stays a real list
  marker, so `[^1]: x` over `- ` keeps its definition while `[^1]: x` over `-` does not.
- e686831: Keep an inline construct spanning a demoted setext heading

  Only one content line makes a setext heading in Obsidian, so a multi-line one is demoted
  to a paragraph. That rebuild reparsed each line on its own, which gave every delimiter no
  partner to pair with: `Foo *bar` / `baz*` / `====` reported no emphasis where Obsidian
  reports `em:bar baz`. CommonMark's own examples 81 and 82 are exactly that shape.

  The content lines are now reparsed as one fragment, with per-line offsets carried through
  so a fragment inside a blockquote still lands correctly. The underline keeps its own
  handling.

- ed2eecf: A setext heading after a link reference definition reports the right start line.

  `[ref]: /url` / `para` / `===` is reported at line 1 by Obsidian. Upstream gives the
  heading a span that starts on the definition's line, so the two nodes overlap.

- 55abff7: A setext heading overlapping a link reference definition starts at its content's line.

  `[ref]: /url` / `para` / `===` reports the heading at line 1, where it had been reported
  at line 0 and overlapped the definition.

- 174087b: Show `<!-->` and `<!--->` as text, which is what Obsidian does.

  CommonMark 0.30 added these two empty-comment short forms and micromark
  implements them, so they parse as HTML and render as nothing. Obsidian's parser
  predates the change and shows them literally. That makes the difference visible
  rather than structural: the characters are in the note, and we were dropping
  them. Three corpus cases.

- 20e16bc: Keep a `%%` from ending a footnote definition.

  Obsidian recognises the definition first, so a `%%` inside one cannot open a
  block comment: `[^1]: a` / `%%` / `b` is a single definition holding three
  lines of prose. We opened a comment there, which ended the definition early
  and left the following line as a paragraph of its own. The comment becomes the
  text it was written as and the lazily continued lines fold back in.

  This is the twelfth and last case from the Footnotes Shortcuts author's
  deviation list.

  The round-trip ceiling rises from 93 to 97. Those four are the escape
  accumulation already recorded against that gate, reached by new shapes rather
  than newly introduced: folding a lazy line back emits a `break`, and
  `remark-stringify` writes a hard break as a trailing backslash that re-parses
  as an escaped one, so each pass adds another. A more faithful parse therefore
  raises that number, and the fix belongs in how these passes represent a folded
  line.

- 68581ad: Do not let a tab after one to three spaces open indented code

  micromark expands a tab to the next four-column stop, so ` \t` reaches column
  four and opens an indented code block. `remark-parse@8` does not count a tab that
  follows a space at all, so the same line is ordinary content — and since Obsidian
  parses with `remark-parse@8`, a footnote definition written there is a definition
  rather than code.

  Measured against the legacy stack across nine indentations, which is what settles
  a rule this counter-intuitive. A tab counts fully only when it opens the line:

  ```
  \t[^1]: def       -> code        (tab opens the line)
  \t \t[^1]: def    -> code
      [^1]: def     -> code        (four spaces)
   \t[^1]: def      -> definition  (one space, then a tab)
    \t\t[^1]: def   -> definition
     [^1]: def      -> definition  (three spaces)
  ```

  So a line is indented code only when it opens with a tab or with four spaces.

  Only a single-line block is reinterpreted: a run of indented lines would need
  each one's indent weighed against the others, and the recorded families are all
  one line.

- 3b99938: Decide link reference definitions the way `remark-parse@8` does.

  Obsidian's definition rules are the inverse of CommonMark's in both directions,
  so no partial guess reproduces them:

  - a label may contain a nested `[`, because the scan breaks only on `]`, so
    `[a[b]: /url` **is** a definition where CommonMark says it is not;
  - a destination may not contain `[` or `]` at all, enclosed or otherwise, so
    `[foo]: [^9]` and `[foo]: <[^9]>` are **not** definitions where CommonMark
    says they are;
  - a title has no backslash escaping and must end its line, so `[foo]: /url`
    over `"a \" b"` closes at the inner quote, finds `b` still to come, and
    rejects the whole thing.

  `src/lib/legacy-definition.ts` ports `lib/tokenize/definition.js` verbatim,
  reduced to the non-commonmark path, and answers only whether a span is a
  definition. A `definition` node it rejects is rebuilt as the prose Obsidian
  shows: line by line, because re-parsing the span whole would just produce the
  same definition again, and a line that still parses as one contributes its raw
  text — which the bare-reference pass then reduces, so `[^1]: x` reads `1: x`.

  Four corpus cases, closing the `lrd-destination-reference` and
  `lrd-title-escapes` families.

- 408d03e: Absorb an indented continuation into the footnote definition above it.

  `micromark-extension-gfm-footnote` takes a definition's indented continuation
  while parsing, so `[^1]: a` / blank / `    more` is one definition holding two
  blocks. A definition produced by a transform was never seen by that parser —
  splitting `%% [^1]: body` off a comment closer is the case — so its
  continuation stayed a sibling and surfaced as a root-level code block, whose
  text Obsidian never shows.

  The four-space indent is stripped before re-parsing, so the result matches
  what the parser would have built: four spaces is a paragraph, eight is still
  code. Only a block separated by exactly one blank line is taken, and only an
  indented one — an unclosed fence is also a `code` node with no language, and
  swallowing it would hide content Obsidian renders.

- ccb82fd: Make a column-zero underline a heading inside a container, and index only
  top-level headings.

  Two rules the fuzz harvest surfaced together, each explaining dozens of cases.

  At root, `para` over `===` has always been a setext heading. Inside a
  container it was not: the underline sits outside the container's own prefix,
  so it arrived as lazy continuation and the run became ordinary text — `- $x`
  over `===` rendered as `$x ===` where Obsidian reports one list holding a
  heading named `$x`, underline consumed. Fifty-odd reduced cases were all that
  shape. It is limited to a two-line paragraph on purpose: a longer one does not
  fold the same way, and `-  *em*` / `<br>` / `](u)` / `---` reports no heading
  at all.

  Fixing that exposed the second rule. Obsidian _renders_ a heading inside a
  container but does not _index_ one: `> # Foo` paints a heading and records
  none, while every heading its metadataCache does record sits at the top level,
  indented or not. Four independent cases agree, so the metadata projection now
  takes headings from the document's own children rather than from everywhere.

  51 cases move to matching, with no regressions.

- 3eaa7d6: A multi-line list item ends at its last content character.

  `- a` over a blank line over `  b` ends at `b`, where only a single-line item ends at the
  blank line that follows it.

- fbcca66: A sloppy dash underline is a thematic break, even over a single line.

  `Foo` over `   ----      ` is a paragraph plus a thematic break: `remark-parse@8` accepts a
  setext underline only with nothing around it, and a dash run it refuses still has its
  thematic-break reading. `===` is unaffected, having no block form to fall back to.

- 3f7ef2f: Open a display-math block on a `$$` that ends a line inside a container.

  At the document level a trailing `$$` does not open a block — `tail $$` / `x` /
  `$$` is prose followed by an empty formula, which we already matched. One level
  in, the same three lines are `tail ` followed by a block holding `x`.

  The rule was measured, not inferred. Two recorded cases disagreed about
  mid-line `$$` and no reading of them separated "mid-line" from "inside a quote"
  from "inside a definition", so the corpus now probes each axis alone.
  `math/midline-plain` against `math/midline-quote` and `math/midline-list` is
  what isolates the container as the deciding factor; without those three the
  rule could not have been written down.

  micromark already leaves the shape to work from: the trailing `$$` becomes an
  empty `math` sibling while the opener stays as text in the paragraph, so moving
  the split point is enough and nothing is re-tokenized.

  Three corpus cases, including `math/list-boundary`, which had been outstanding
  since the first recording.

- 44b4db4: Pin the behaviour 1.14's coloured highlights will change.

  1.14 colours a highlight from a leading emoji, as Bear does, and it is a parse
  change rather than only a rendering one: the emoji is consumed, so it leaves
  both the rendered text and the highlight's content. Recording the whole corpus
  against 1.13.7 and against the 1.14.4 beta and diffing shows that of 1503 cases
  only the highlight probes differ — 1.14 changes nothing else this harness can
  see.

  62 cases pin it. Only a leading emoji is consumed, only the first of two, and
  any whitespace after it survives — tab and newline included. Exactly twelve
  pictographs count: the six rainbow circles and six rainbow squares. The set is
  closed rather than sampled: both families were probed in full, and twenty-two
  candidates from every other colour-bearing family (coloured hearts, coloured
  books, the small geometric squares, diamonds) qualified none.

  The strip is by codepoint, not grapheme — `==🔴\uFE0F text==` consumes the
  circle and leaves the variation selector orphaned — and the marker does not
  rescue a highlight that would not form anyway.

  No behaviour change here, deliberately. 1.13.7 does not consume the emoji, so
  stripping it now would be wrong for current Obsidian, and when it does ship the
  drop belongs in `rehype-obsidian` — the file keeps its text, so consuming the
  emoji in the tree would let a formatter delete it. The cases are recorded
  against 1.13.7 and will diverge the moment 1.14 becomes `latest`.

- 755bded: Let a list absorb a definition or table on the line below it.

  A column-zero line that looks like a footnote definition or opens a table no
  more interrupts a list's lazy continuation than it interrupts a paragraph, so
  `-` over `[^3]: real definition` is one list to Obsidian, as is
  `-      item` over a definition and a table.

  Lists had been excluded from this deliberately: absorbing a definition as a
  sibling child used to render its body in the footnote list rather than inline,
  costing three cases that already matched. That exclusion is no longer needed.
  `footnoteInterruptTransform` now walks into every block container, so a
  definition absorbed into a list item is folded into that item's own paragraph
  immediately afterwards and the body stays inline. Lifting the restriction with
  the fold in place gains two cases and costs none.

  Two corpus cases.

- c6f8ac8: Shrink a failing fuzz seed to a minimal case.

  "Seed 3 disagrees" is not a bug report: a generated document is three blocks
  of nested, half-broken delimiters and most of those characters have nothing
  to do with the disagreement. The shrinker reduces one to the smallest
  document that still disagrees, which is something a person can read and the
  corpus can keep.

  Candidates are recorded in one batch per round rather than one at a time,
  because Obsidian costs seconds to start and milliseconds per case. Three or
  four rounds take a document to a line or two.

  It works: four seeds from the first sweep reduce to `![[**^[inline]**]]`,
  `> **<` over `===`, a two-line table whose cells carry a trailing space, and
  `1. [^==mark\==]` — between ten and nineteen characters each.

- 9b9b338: Pair `%%` comment markers lexically, so a region whose opener a container
  swallowed is rebuilt.

  Obsidian pairs `%%` over the raw source: the first opens, the next closes, and
  block structure has no say. Ours is a micromark construct, so a container can
  take an opener as ordinary content — a definition's indented `    %%` becomes
  part of the definition — and the _closer_ is then read as the next opener, which
  shifts every marker after it by one. No transform over the resulting tree can
  repair that, because the tree no longer records where the regions were.
  Recomputing them from source does.

  Three rules, each one measured after a wrong guess cost cases that already
  matched:

  - Pairing resumes on the **next line** after a closer, not straight after it. A
    comment ending mid-line leaves the rest of that line as prose, and a `%%`
    inside it is literal.
  - An **unclosed** region does not run to the end of the note. `> %%` alone
    leaves a definition further down alive.
  - A region does not swallow a line that **opens a block of its own**.
    `[^9]: orphan` / `    %%` / `[^1]: one` / `%%` is two definitions and no
    comment, where the same shape over plain prose is one definition holding the
    whole region.

  The rewrite only fires on the mis-pairing signature — a comment node touching
  the region at its start or closer without covering it — so a `%%` shielded by a
  code span or fence, where no comment node exists, is left alone.

  Three corpus cases.

- a588b42: A footnote label whose list-marker separator is spaces followed by a tab is no longer a
  definition.

  `*` two-spaces `[^1]: def` is a definition in Obsidian; `*` two-spaces tab `[^1]: def` is not.
  The trailing tab is what kills it, and the two agreeing cases either side are what make it the
  tab rather than the width.

  This is the tab-after-space asymmetry seen from the other side. The package already measures
  that such a tab contributes nothing to a list item's content column; what this adds is that the
  same tab still reaches its column stop for the indented-code threshold, which puts the label
  four columns in and makes its brackets literal. One tab, two answers, depending on which
  question is being asked.

- b7bc5f9: A block identifier alone on its own line is now reported.

  `x` / blank / `^b` names the paragraph above it in Obsidian and its own paragraph leaves
  the section list entirely. When the next block abuts the identifier instead — `^blk` over
  `- item` — that paragraph survives and names itself.

- e3ea10c: Records sixteen probes drawn from a fuzz sweep, exposing eleven divergences.

  Five already matched. The rest are new, attributed debt: a block identifier inside an
  inline wrapper followed by punctuation, a bare footnote definition over a whitespace line,
  display math inside emphasis across a line ending, a callout title holding `^blk` or `^[]`,
  a hidden comment under a setext underline, and a lone `&` as an ordered item's content.

- e4aa57f: A tab after a space does not make an indented code block inside a quote.

  `>   ` followed by a tab and `[^1]: def` is a footnote definition at column 2, where it had
  been read as code.

- 37303fa: A tab-indented list item starts just past its tab.

  `- parent` over `\t- child` reports column 1, as does `- a` over `\t - b`.

- 8b14a0d: A tab-indented footnote definition starts at its containing block's content column.

  ` \t[^1]: def` starts at column 0 at the root of a document, as a space-indented one
  already did.

- ead429b: A definition behind a list marker with a tab separator starts at the marker.

  `1.` followed by a tab, a space and `[^1]: def` reports column 3 rather than the bracket's
  column 4.

- b8c9391: A tab in a list marker's separator now reaches its column stop when deciding a definition's
  column.

  `-` tab `p` gives an item whose content column is **4** — the tab's stop — so a definition
  indented four, five or six columns under it sits at column 4. The column was being computed
  from the separator's character length, which counts a tab as one, so it came out 2.

  `1.` tab `p` was already right, and only by coincidence: its character length is 3 and the
  single-digit-dot adjustment lifts that to 4, which is the tab stop by accident. The capped path
  for five-or-more-space separators had measured tabs correctly all along; this is the uncapped
  path getting the same treatment.

  A tab **after** a space still reaches nothing, which is the asymmetry this package records in
  three other places: `-` space tab `p` is column 2 — the marker plus its one real space, with
  the tab contributing zero. So the separator is truncated at its first tab unless it starts with
  one.

  Measured as a grid of five marker shapes against seven label indents.

- d695080: A body row that delimits no cells ends the table

  The same rule the header and delimiter rows obey now applies to body rows: a leading
  pipe alone separates nothing, so `| a |` over `| --- |` followed by `| b` is a table
  plus a paragraph rather than a three-row table.

  `tableRowStyleTransform` already ended a table where a body row disagreed with the
  header about outer pipes, but it tested only whether the row _started_ with a pipe —
  so `| a |` and `| b` agreed and nothing was cut.

  Completes the family: all 12 `probe/table-pipes/*` cases now match.

- 75626bb: A promoted table keeps its body rows.

  `|a|` over `|---|---|` over `|b|c|` is one table in Obsidian. `tableShortDelimiterTransform`
  built the header and delimiter and reparsed everything after them as separate blocks, so the
  body row came back as a paragraph.

- b2e1ab6: An indented body row ends a piped table rather than belonging to it. `| a | b |` over
  `| --- | --- |` followed by ` | c | d |` is a two-line table and then a paragraph in Obsidian;
  the indented line had been absorbed as a third row.
- 1f0ec67: In a table with no outer pipes, a footnote label line is a row.

  `a | b` over `--- | ---` over `[^1]: x | y` now extends the table rather than defining `1`.
  A piped table, a blank line before the label, and a label with no pipe all still define.

- a1e11fd: A body row's leading pipe is now read at the table's own content column rather than after its
  indentation, so an indented row in a pipeless table stays a row. `a | b` / `--- | ---` /
  `  | c[^2] | d` kept all three rows in Obsidian and stock micromark while we dropped the third
  and killed the reference in it.
- 4e4219d: A short delimiter row only builds a table if it delimits cells

  `tableShortDelimiterTransform` reproduces Obsidian building a table of the delimiter's
  width — `| a | b |` over `| --- |` renders `a` alone. That promotion now obeys the same
  precondition as every other table rule: a row whose only pipe is the leading one
  declares no columns, so there is nothing to promote.

  Recorded both ways, which is what settled it — GFM declines both forms, so only one of
  them needed promoting:

  | source                       | Obsidian  |
  | ---------------------------- | --------- |
  | `\| a \| b \|` / `\| --- \|` | table     |
  | `\| a \| b \|` / `\| --- `   | paragraph |
  | `\| a \| b` / `\| --- `      | paragraph |
  | `\| a \|` / `\| --- \| ---`  | table     |

  All 16 `probe/table-pipes/*` cases now match.

- ff558dd: A pipe row must actually delimit cells to make a table

  GFM treats the outer pipes as optional, so `| a` over `| ---` builds a table. Obsidian
  reads it as a paragraph: a leading pipe is a wall rather than a separator, so a row
  carrying only that one delimits nothing.

  | source                        | Obsidian  |
  | ----------------------------- | --------- |
  | `\| a` / `\| ---`             | paragraph |
  | `\| a \|` / `\| ---`          | paragraph |
  | `\| a` / `\| --- \|`          | paragraph |
  | `\| a \| b` / `\| --- \| ---` | table     |
  | `a \| b` / `--- \| ---`       | table     |

  A row with no leading pipe needs only one, which is why `a | b` is a row and `| a` is
  not. The rule applies to the header and the delimiter alike — either one failing means
  no table.

  Found by a fuzz sweep: 128 failures reduced to 118 causes, and this was the one real
  cluster with eight independent seeds landing on it. 11 of 12 new `probe/table-pipes/*`
  cases match, from 7 before.

- ad6ac19: A tag does not start straight after a literal `]`.

  `# [^1[[a#^blk\]]#tag` reports no tag: the reference's label runs to the first `]`, the
  next `]` is ordinary text, and a `#` against it is text too. After a _construct's_ closer
  a tag does start -- `a[[t]]#next` reports one -- which the tokenizer cannot distinguish
  and the tree can.

- 5dd9d54: A tag's end frees the caret for a block identifier. `#tag^blk` registers `blk` in Obsidian
  where `word^blk` registers nothing, so it is the tag and not the word character before the
  caret. Read from the tree's `tag` nodes rather than a pattern, so `a#tag^blk` and `#1^blk`
  correctly register nothing.
- 3a1657d: Fixes a regression: a `#tag` inside a link label is a tag again.

  `[#tag]`, `[#tag](u)` and `[#a/b]]` all report a tag in Obsidian. Refusing a tag after any
  label opener — added to stop ` ![[#t` reporting one — was too broad and suppressed all of
  them. The refusal now applies only to a doubled opener, `[[` or `![[`, where a `#`
  introduces a heading fragment rather than a tag.

- c8005aa: A tag does not start inside an unclosed `[[` or `![[`.

  ` ![[#t` reports no tag in Obsidian — the `#` sits in literal text. A tag may begin straight
  after a _completed_ inline construct, so `a[[t]]#next` tags `next`, but micromark emits an
  `exit` for the `[` opener token itself, which made an unfinished label look like a finished
  construct.

- abcd7bf: Recognise a tag after a tab, and allow slash-shaped tag paths

  Two independent bugs in the tag tokenizer, both measured against Obsidian 1.14.4:

  - **A tab before `#` did not start a tag.** micromark expands a tab into
    `horizontalTab` plus `virtualSpace` fillers up to the next tab stop, so the code
    immediately before the `#` is the filler rather than the tab. `rd⇥#tag` yielded
    nothing while `rd #tag` tagged correctly.
  - **A slash needed a tag character after it, and did not count as a non-digit.** So
    `#a/`, `#a//b` and `#123/456` were all rejected, though Obsidian reads each as a
    tag. A slash is now ordinary content and satisfies the non-digit requirement,
    which keeps `#123` correctly _not_ a tag.

  10 cases move from `replicate` to `match` with no regression, and the positioned
  oracle's `tags` divergences drop from 16 to 6.

- 6fa6189: Stop a GFM table interrupting a paragraph, which Obsidian does not allow.

  micromark lets a table start on the line directly after prose, so `text` followed
  by a header and delimiter row becomes a paragraph plus a table. Obsidian keeps
  reading the paragraph and renders the pipes literally. Omitting the blank line
  above a table is common enough in real notes that the two readings diverge often.

  The table is folded back by parsing each of its lines on its own. Re-parsing the
  combined slice would rebuild the same table, since the delimiter row is still
  there; one line at a time never has a delimiter row to pair with, so each is read
  as the inline content it is — `| *a* | b |` keeps its emphasis. Six corpus cases.

- 75f470f: Correct the callout marker rule, which was wrong in four ways.

  The author of Obsidian Footnotes Shortcuts sent a list of places Obsidian
  deviates from stock remark, and our own recorded goldens confirm every
  callout point in it. The marker is stricter than we had it:

  - It binds to `>` plus **at most one space**. `>  [!note]` is an ordinary
    quote, and by the time the tree exists that second space is gone — the
    tokenizer ate one and the paragraph starts at the other — so the source
    line has to be consulted.
  - It must end the line or be followed by a space or tab. `> [!note]x` and
    `> [!note]-x` are quotes, not callouts with a title.
  - A fold marker must touch the bracket.
  - The type may contain inner whitespace (`> [! note]` reads "Note") but may
    not be empty (`> [!]` is a quote).

  Six corpus cases move to matching, with no regressions.

- 8979d4c: A task checkbox must be followed by whitespace.

  `- [ ]x` reports the plain list marker, as `- [ ]` with nothing after it already did.

- cbcb32b: A task checkbox is a marker, not part of a setext heading's content.

  `- [ ] ~~del~~` over `===` is a heading named `~~del~~` in Obsidian, with the checkbox
  counted as the task marker. A task item's paragraph spans from _before_ its checkbox while
  its children correctly begin after it, so slicing by the span put `[ ] ` in the heading's
  text and name.

- 89d6230: Keep a footnote definition inside a task item

  `- [ ] [^1]: def` lost its footnote entirely: `legacyDefinitionPromoteTransform`
  read the task's paragraph as a link reference definition and produced a
  `definition` named `^1`.

  A `^` label is never a link reference definition. `remark-footnotes` registers its
  block tokenizer ahead of `definition` in the stack Obsidian parses with, so it
  claims `[^1]: def` first — the legacy stack reports a `footnoteDefinition` there.
  The nested bracket that pass exists for, `[a[b]: /url`, is untouched.

  Found by the lossiness gate, which reports a `[^label]` the source wrote but the
  tree can no longer reach.

- 0e3676c: A tilde fence after a task marker reparses as one.

  `- [ ] ~~~~` nests a code block in Obsidian, as four tildes are a fence delimiter rather
  than an empty strikethrough. `taskReparseTransform` sliced from the paragraph's own span,
  which can start before the checkbox, so it reparsed `[ ] ~~~~`, got a paragraph, and
  declined. It now follows the paragraph's children.

- 589a99e: `<textarea>` no longer swallows the blocks after it.

  micromark counts `textarea` as a raw-text element; Obsidian's parser predates that and
  keeps only `{pre, script, style}`. So `<textarea>` over a blank line and two paragraphs is
  four blocks to Obsidian and was one to us. `pre`, `script` and `style` are untouched.

- 01f39ee: A tab between thematic-break markers cancels the break

  `remark-parse@8` accepts only spaces between the markers, so a tab drops the line to the
  list tokenizer and it becomes nested items. CommonMark counts a tab as whitespace and
  reports a break, which is what we did.

  ```
  * * *     a break to both          *⇥*⇥*⇥    three nested lists
  *  *  *   still a break            * * *⇥   a trailing tab alone cancels it
  ***       still a break            _⇥_⇥_⇥   a paragraph: `_` opens no list
  ```

  Each item starts at its marker and runs to the end of the line, as `metadataCache`
  reports. Only a break whose own source holds a tab is touched.

- 9448a54: End a table at a body row that drops the header's outer pipes.

  GFM lets every row choose independently, so `| a | b |` over `| --- | --- |`
  keeps reading `c | d` as a row. Obsidian ends the table there and reads the rest
  as prose, which is visible rather than structural — the pipe shows up in the
  text, and a formatter rewriting the "table" would mangle a line Obsidian never
  treated as one.

  Worth recording for anyone extending this: unlike emphasis, highlight and link
  reference definitions, **there is no tokenizer to port here**. Measured against
  the legacy stack directly, `remark-parse@8` makes `c | d` a row exactly as GFM
  does, and renders `| a | b |` over `| --- |` as two cells where Obsidian renders
  one. Obsidian's table handling is its own, so these rules are derived from
  recorded output rather than from a port.

  Two corpus cases.

- d667639: Let an unclosed `$$` block opened in a container keep consuming.

  CommonMark ends an unterminated block at the end of its container, so `> $$`
  followed by an unindented `lazy` line closes the math and starts a paragraph.
  Obsidian leaves the block open and swallows the line — and the swallowed text
  stops being parsed, so a `[^1]` in it is part of a formula rather than a
  footnote reference we would otherwise reduce to a bare name.

  Scoped by measurement rather than by analogy. Against the legacy stack
  `remark-parse@8` with `remark-math` agrees with Obsidian on exactly this shape,
  and disagrees on the two neighbouring ones — an unclosed `<!--` escaping a
  quote, and a mid-line `$$` — so neither is covered here. Only a sibling
  starting at column 1 is absorbed, the same rule the unclosed fence uses.

  One corpus case.

- d3ffd9f: Reproduce Obsidian's escaped closing delimiters for wikilinks, embeds and
  highlights.

  A backslash does not stop `]]` or `==` closing in Obsidian, so `[[target\]]` is a
  link and `==text\==` is a highlight holding `text\`. CommonMark escapes any ASCII
  punctuation, so we were leaving all three as literal text.

  This was previously triaged `report-upstream` on the reasoning that the
  inline-math exception — `$x\$` _does_ honour the escape — suggests the behaviour
  is unintended. That conflated two separate questions. Whether Obsidian should
  change is for the Obsidian team; whether this package reproduces today's Obsidian
  is not, and compat mode answers it the same way everywhere else. A note whose
  `[[target\]]` resolves in the app has to resolve here too.

  Reproducing it surfaced a second asymmetry inside the first, now recorded in
  `COMMONMARK-DIVERGENCES.md` as sharper evidence for the same conclusion: for
  highlights the escape is honoured on an _opening_ run and ignored on a _closing_
  one, and ignored on the closer only while a highlight is actually open. All
  three of `==text\==`, `\==text==` and `\==text\==` behave differently, which no
  single "this delimiter ignores escapes" rule can produce.

  Wikilinks also needed the display and resolved forms separated: Obsidian resolves
  `[[target\]]` to `target` but shows `target\`. `path` is now the resolved target
  and the previously unused `value` carries what a consumer should render.

  Five corpus cases.

- d2924b1: Project an embed's whole target, a humanised callout type, and a heading's
  block identifier.

  Three display rules the comparison had wrong, all measured against recorded
  Obsidian:

  - An unresolved embed shows its target as written, fragment included.
    `![[Document.pdf#page=3]]` reads `Document.pdf#page=3`, where a plain link
    reads only its path — we dropped the fragment for both.
  - A callout with no title shows its type _humanised_, not merely capitalised:
    `[!NOTE]` reads "Note" and `[!project-status]` reads "Project status", so
    the rest is lowercased and hyphens become spaces.
  - A heading carries a block identifier as readily as a paragraph, and
    `## Heading ^id` is rendered without it.

  Ten cases move to matching, with no regressions.

- 85b59b8: A `%%` comment with no closer hides what follows it in the same container.

  `1. %%note` over `===` renders nothing in Obsidian. An unclosed comment usually absorbs
  what follows it, so skipping the node was enough; inside a list item a `===` line lands
  beside it instead, and the sibling still rendered.

- 6b2f5e1: An un-nested list reports its own line rather than its parent item's.

  `- a` over a blank line over `  - b` over a blank line over `  c` reports the inner item
  against line 2, where the two lines had coincided in every other case.

- 54cde93: The parity harness now treats a colon anywhere in a destination as external, not just a
  leading scheme. `[link](foo\)\:)` is a link to `foo):` in both trees, and Obsidian renders
  it `class="external-link"`, so the recorder reports no vault link where we reported one.
  The three copies of that test are now one predicate.
- 27d2878: Record 29 cases from the Footnotes Shortcuts author's deviation list.

  An independent list of places Obsidian deviates from stock remark-parse 8 +
  remark-footnotes 2 + remark-math 3. Every callout point in it was already
  confirmed by goldens recorded here, which is why the rest is recorded rather
  than taken on trust.

  16 of the 29 documents were not in the corpus at all, despite 2182 cases —
  an outside reader of the same problem found surface two sweeps and a spec
  import had missed. 17 already match; 12 diverge and are triaged with their
  source, covering block structure after a callout marker, leading-pipe style
  in tables, the tail of a frontmatter closing line, two `%%` opener rules, and
  whether anything inside `^[...]` stays live.

- 84fe645: End a footnote label at the first `]`, and read a stripped label from source.

  GFM lets a backslash escape a bracket inside a footnote label, so `[^a\]b]: body`
  is a definition named `a]b`. Obsidian stops at the first `]`, finds `b` rather
  than `:` after it, and leaves the line as prose. Measured against the legacy
  stack, `remark-footnotes` agrees with Obsidian.

  Getting the rendered text right needed a second change. Obsidian does not apply
  escapes while scanning a label either, so the leading `[^a\]` names `a\` and
  keeps the backslash — but by the time a text node exists that backslash is
  gone. The bare-reference pass now reads the label from the source span the node
  came from rather than from its value, which is also what lets it tell `\[^9]`
  from `[^9]`.

  One corpus case, and the pair of them closes the escape-fidelity gap: a
  formatter can no longer drop a bracket the author escaped, nor invent a
  definition from a label Obsidian never closed.

- d54b859: Reject a doubled bracket in a wikilink alias

  A `[[` is no more legal in an alias than in a target. Accepting it made `![[a|[[b]]]]` an
  embed of `a` aliased `[[b` — indexing a target Obsidian does not report and losing the one
  it does, the inner link to `b`. Obsidian reads the outer markup as literal text around that
  link.

  Rejecting lets micromark retry one position along until the brackets are clean, which is
  the same mechanism the target side already used.

- 13bfa78: Two wikilink display rules.

  An empty alias displays nothing rather than falling back to the path, so `[[a|]]` resolves
  to `a` and displays empty. And a vault heading search strips its whole `#` run, so
  `[[## heading text]]` displays `heading text`.

- 456658a: Render a written-but-empty wikilink alias as empty, matching Obsidian.

  `[[a|]]` displays nothing in Obsidian while `[[a]]` displays `a`. A `wikilink` node
  carries `alias: ""` for both, so `value` fell through to the path and showed a target
  Obsidian hides. The alias **marker** is what distinguishes them, and it is now what marks
  the part present.

- 8d19640: An empty wikilink target does not close the link

  `[[]]]` is a link to `]` in Obsidian: an empty target is not a link, so the first
  bracket is taken into the target and the next two close it. We rejected at the first
  `]` instead and found no link at all.

  The distinction is a consumed-character count rather than emptiness of the span, which
  is what keeps the neighbours intact:

  | source  | Obsidian                                           |
  | ------- | -------------------------------------------------- |
  | `[[]]`  | no link — the scan runs out                        |
  | `[[]]]` | a link to `]`                                      |
  | `[[ ]]` | a link with an empty path — a space is a character |

  4 cases move from `replicate` to `match` with no regression.

- 5c81a4a: A backslash before `[` stays in a wikilink target.

  `![[\[^1]]]` embeds `\[^1` in Obsidian, with the backslash in the path — `src` and `alt`
  both show it. We unescaped it to `[^1` and resolved the wrong target. Completes the rule
  the tokenizer already follows: inside a wikilink a backslash is never an escape.

- a4f2c93: A backslash no longer smuggles a doubled bracket into a wikilink target.

  `[[\[[a|b]]]]` holds `[[` in its target, so it cancels exactly as `[[[[a|b]]]]` does and
  Obsidian reports no link there. `pathEscape` consumed the bracket as content, which let the
  backslash past the doubled-bracket check and produced a link to `[[a`.

- 95d1816: A wikilink's fragment and alias keep a lone `]`, as its path already did.

  `[[a#^blk](target]]` indexes `a#^blk](target` and `[[a|b](c]]` indexes `a` displaying
  `b](c` -- the run continues to the `]]`. Both scans went straight to the closer on the
  first bracket and then failed for want of a second, where `path` has always used a
  rewindable check. The two had drifted apart.

- c891097: A `[[` inside a wikilink's fragment abandons the opener, as it already did inside the path.

  `![[d.pdf#page=3. [[word]]` built an embed whose heading was `page=3. [[word`; Obsidian
  abandons the opener and lets the inner wikilink win. A single `[` is still ordinary
  content, so targets like `[link](u)` are unaffected.

- f9e8565: A trailing backslash in a wikilink's heading is kept in the display text.

  `[[a#h\]]` resolves to `a#h` and displays `a > h\` in Obsidian's cache. The tokenizer
  resolves the escape, so the node's `heading` has already lost it and only the source knows.

- 0325f40: Split a wikilink's display form on every `#`, matching Obsidian.

  `[[a#b#c]]` reads `a > b > c` in Obsidian; we rendered `a > b#c`. Only the destination
  splits on the first `#`, so `heading` is unchanged — it is still what a consumer resolves
  against.

- 68431b2: Render a wikilink's heading as written, keeping a trailing backslash

  Obsidian resolves `[[a#^blk\]]` to the heading `^blk` while still _displaying_
  `a > ^blk\`. The path already carried that pair — the resolved target stripped and
  the written form kept for rendering — but the heading did not, so `value` was built
  from the stripped heading and dropped a character the app shows.

  Measured on the recorded corpus: 13 cases move from `replicate` to `match` with no
  regression, reaching past wikilinks into embeds, a callout, a table and an inline
  footnote.

- 4716cc6: Keep a lone `]` inside a wikilink target

  Only a doubled bracket closes a wikilink, and Obsidian reads a single one as part of
  the target: `[[[](u)]]` links to `[](u)`.

  We consumed the first `]` as a closing marker and rejected when the second was
  missing, which failed the whole wikilink — CommonMark's link construct then claimed
  the inner `[](u)`, so a markdown link to `u` was reported where Obsidian reports a
  wikilink. A `check` for `]]` now decides before the bracket is committed, because
  the character after it is what settles the question.

  Scoped to the target. A stray `]` in a heading or alias is left alone, since nothing
  recorded says what Obsidian does there.

  10 cases move from `replicate` to `match` with no regression.

- 97aee9e: Resolve a no-break space in a wikilink target as an ordinary space.

  `![[*\u00a0*]]` is an embed of the note `* *` in Obsidian. Applied to `path` and `heading`
  only — the resolved target — so `value` and the source keep the character the author typed
  and a formatter cannot rewrite it.

- 6417e84: A trailing backslash in a wikilink's path is kept in the display text.

  `[[target\]]` resolves to `target` and displays `target\`, matching the rule already
  applied to a trailing backslash in the heading.

- 02e6bf9: Two wikilink target rules, matching Obsidian.

  - A leading `|` is a path character, not an alias separator: `[[|b]]` is a link to `|b`,
    where we produced no link at all. Obsidian only splits where the split leaves a target
    behind.
  - A backslash does not escape the fragment separator: `[[a\#b]]` is a link whose target is
    `a\` and whose heading is `b`. Inside a wikilink a backslash is an ordinary character,
    never an escape — the same rule `|` and `]` already followed.

  A resolved target still drops a backslash that touches the closer, so `[[target\]]`
  resolves to `target` and `[[a#^blk\]]` to `^blk`. An alias never does.

- e8eed76: A wikilink's trailing `#` stays in its target.

  `[[page#]]` resolves to `page#` rather than `page`. A `#` inside an alias is unaffected —
  `[[a|b#c]]` and `[[a|#b]]` both still resolve to `a`.

- 0147281: Trim a wikilink's inner text as a whole

  Obsidian trims the text between the brackets **once**, then splits it on `#` and `|`.
  Trimming each part separately is not the same thing: `[[  Note  #^id  ]]` resolves to the
  path `Note  ` there, where trimming the path on its own ate two spaces Obsidian keeps.

  So the first part present loses only its leading whitespace and the last only its
  trailing, while anything interior keeps both. A lone path is both first and last, so
  `[[ page ]]` and `[[ ]]` are unaffected.

- 9d58896: Harvest 244 minimal cases from a 500-seed fuzz sweep.

  The sweep found 270 disagreements, shrank each to the smallest document that
  still disagrees, and grouped by that reduced form. The result is 244 distinct
  causes averaging a couple of dozen characters — small enough to read, and now
  permanent corpus cases rather than seeds someone has to re-derive.

  38 of them already matched by the time they were recorded, because fixes
  landed while the sweep ran. 206 are genuine divergences, led by embeds (65),
  highlights (41) and footnotes (26). The corpus grows to 2455 and the headline
  rate falls to 86.7%, which is the honest figure: these are 206 real
  divergences that were previously unmeasured, not a regression.

  The repeated forms are worth naming. `| a \n| --- \n` turned up from eight
  independent seeds — a table whose cells carry a trailing space — and `^blk`
  from six. Both were already known, which is a reasonable check that the
  pipeline finds real things rather than noise.

  Two gates fired on the new cases and both findings are recorded rather than
  waved through: one text node spans `- [` while holding `[ ]`, a heading built
  at a list marker's offset instead of the task content's, and five footnote
  labels are claimed by another construct before the footnote pass sees them.
  Each is enumerated so a sixth cannot arrive unnoticed.

- 56a28ed: Add pathological-input tests, run in a watchdog process.

  A catastrophic regex or a quadratic tokenizer blocks the thread, so no
  same-thread timer — vitest's included — can interrupt it. Each shape is parsed
  in its own process that the parent kills after a generous budget, which is the
  model cmark uses for the same job.

  Eighteen shapes, taken from cmark's `pathological_tests.py` and the issues
  behind it at the sizes those reported, plus the same shapes aimed at this
  package's own constructs. Attribution is measured by running each with and
  without this plugin, so an upstream limit is never mistaken for ours.

  Two are ours and quadratic, and are recorded rather than gated: a 20,000-long
  `=` run takes the bare chain 26ms and ours over 20s, and `^[` repeated 20,000
  times takes 160ms bare and 21s ours. Both are an opener that rescans to end of
  input on every failure. Five more shapes fail identically without this plugin
  and belong upstream.

- 5ca8f9d: Parse the rest of a callout's marker line as block content.

  `> [!note] Title` reads as a title because a bare run of words is a
  paragraph. `> [!note] [^1]: x` does not: measured against Obsidian it renders
  no text at all, because the remainder is a footnote definition and a
  definition is relocated out of the callout rather than shown as a heading. So
  the test is what the remainder parses as, and only a lone paragraph becomes a
  title.

  Two further details came from the measurement. Such a callout carries an
  empty title node rather than none, because a callout with no title node
  displays its capitalised type — `> [!note]` alone reads "Note" — and this one
  shows nothing. And list markers count as container prefix, so
  `- > [!note] ...` is a callout inside a list item; anchoring on `>` alone
  missed it.

  The first version of that prefix check was an exponential regex, which the
  ReDoS gate caught before it could ship. It is now a bounded scan.

  Three cases from the author's list move to matching; seven of the twelve are
  now done.

- f6281f8: Rebuild an `<!--` region whose opener a container swallowed, and stop the region
  rewrite duplicating trailing blocks.

  The `%%` pre-scan landed first, and extending it to HTML comments looked like it
  should transfer. It does not: `%%` is Obsidian's own construct paired lexically,
  while `<!--` is a CommonMark HTML block that answers to structure `%%` ignores.
  Pairing it the same way broke three cases that already matched, each naming a
  rule:

  - it does not pair across a blank line, so `x <!--` / blank / `hidden` / blank /
    `--> after` is not a comment;
  - an opener inside a link or footnote label is literal, so neither
    `see[^a<!--x-->b].` nor `body [^c<!--d] … ⏎--> end` is one either.

  The signature also had to change. A swallowed `%%` leaves a comment node
  touching the region; a swallowed `<!--` leaves an `html` node covering only the
  four-character opener, so "a node starts here" means nothing and what counts is
  whether one _covers_ the region.

  Fixing that exposed a latent bug in the `%%` rewrite shipped alongside it. The
  splice removed only the blocks overlapping the region while `after` re-parses
  the entire remainder, so a trailing block outside the region was emitted twice.
  No `%%` case hit it because their regions happened to reach the last block; the
  first HTML case produced `tail tail`. The splice now replaces everything from
  the host onward.

  Two corpus cases, closing the `definition-block-owns-region-opener` family.

- 84d2298: Drop block identifiers before comparing projections.

  `^block-id` is an anchor, not content. Obsidian renders neither the trailing
  form `A paragraph. ^id` nor the standalone one, where a `^id` on its own line
  names the block above it and produces no block of its own — our projections
  reported both as text, which made thirteen block-reference cases diverge on
  nothing but the anchor.

  The tree keeps the identifier, the same split used for an undefined footnote
  reference and a surplus table cell: the source said `^id`, so removing it from
  the tree would let a formatter delete an anchor other notes link to.
  `rehype-obsidian` already strips it when rendering, and the projection now
  mirrors that.

  The identifier class is narrower than a permissive reading suggests, and the
  corpus narrowed it: alphanumerics and hyphens only, because Obsidian keeps
  `x ^a_b` as text. The first attempt used `[^\s^]+` and ate `^[[note]` along
  with three other inline-footnote cases, which is what pointed at the tighter
  class.

  Ten cases move to matching.

## 1.1.0

### Minor Changes

- cfe8d89: Add helpers for finding wikilinks and embeds in a tree.

  `collectWikilinks(tree, { embedded })` returns wikilink nodes in document order,
  optionally filtered to embeds or plain links. `collectEmbedPaths(tree)` returns
  the target of every embed, covering both `![[target]]` wikilinks and mdast's own
  `image` nodes, deduplicated and in document order. `isWikilink` and `isEmbed`
  are exported as type guards.

  Consumers previously had to hand-roll a visit and know that `embedded === true`
  is what separates an embed from a link, so that rule was duplicated in every
  dependent. It now lives in the package that defines the node.

  Because these walk the tree rather than the source text, content inside fenced
  and inline code is excluded structurally: it parses to `code` nodes and is never
  visited.

## 1.0.0

### Major Changes

- Stable 1.0 release. All `@quartz-community/*` dependencies now use `^1.0.0` ranges.

  Pre-1.0 caret ranges pinned the minor version (`^0.2.1` means `>=0.2.1 <0.3.0`), so
  published fixes to shared packages could never be resolved by dependents. Moving the
  ecosystem to 1.0 makes caret ranges behave conventionally.
