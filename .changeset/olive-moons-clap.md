---
"@quartz-community/remark-obsidian": patch
---

Parse `*` and `_` the way Obsidian does, behind a new `legacyEmphasis` option that
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
