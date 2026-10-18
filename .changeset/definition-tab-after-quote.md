---
"@quartz-community/remark-obsidian": patch
---

A footnote label indented by a TAB directly after a quote's prefix no longer defines.

`> ` followed by a tab and `[^1]: def` is indented code in Obsidian, so nothing is defined
there. One, two or three spaces then a tab still define, and four spaces already defined
nothing on both sides — the asymmetry this package encodes at line start, now applied relative
to the quote's own content column.

Referee agreement 5812 to 5823 of 6818 documents, the code-range dimension unchanged at 742 of
883, and no corpus regressions.
