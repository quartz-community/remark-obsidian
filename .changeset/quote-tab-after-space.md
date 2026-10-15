---
"@quartz-community/remark-obsidian": patch
---

A tab following one to three spaces no longer counts as reaching the indented-code threshold
below a quote, so `> x` over a two-space-then-tab line stays a lazily continued paragraph as
Obsidian has it. Only a leading tab reaches the threshold, matching the asymmetry already
applied to definitions.
