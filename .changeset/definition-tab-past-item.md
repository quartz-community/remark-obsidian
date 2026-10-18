---
"@quartz-community/remark-obsidian": patch
---

A footnote label indented by a TAB past a list item's content column no longer defines.

`- p`, a blank line, then two spaces, a tab and `[^1]: def` is indented code in Obsidian, so
nothing is defined there. One, two or three spaces then a tab still define, and four spaces
already defined nothing on both sides — the same asymmetry already applied to a quote's prefix,
now measured against an item's content column.

Referee agreement 5823 to 5827 of 6818 documents, the code-range dimension unchanged at 742 of
883, and no corpus regressions.
