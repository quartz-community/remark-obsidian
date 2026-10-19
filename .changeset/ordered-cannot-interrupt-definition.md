---
"@quartz-community/remark-obsidian": patch
---

A quoted definition now continues over an ordered item that cannot interrupt it.

`> [^1]: magna` followed by `> 2. item` is one definition spanning both lines in Obsidian.
CommonMark lets an ordered item interrupt a paragraph only when its number is 1, so `2.` opens
nothing here and the line is ordinary continuation — the same principle already recorded for a
callout, reaching a definition inside a quote.

A grid of three hosts against eight followers says it is only that host and only those markers:
root and list-item hosts agree on all eight, and the quote host diverged on exactly `2.`, `10.`
and `2)`. The five that already agreed are what make this the interrupt rule rather than a fact
about ordered markers — `1.` and `1)` can interrupt, both bullets can, and all five end the
definition on both sides.
