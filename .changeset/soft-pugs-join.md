---
"@quartz-community/remark-obsidian": patch
---

Shrink a failing fuzz seed to a minimal case.

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
