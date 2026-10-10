---
"@quartz-community/remark-obsidian": patch
---

An un-nested list reports its own line rather than its parent item's.

`- a` over a blank line over `  - b` over a blank line over `  c` reports the inner item
against line 2, where the two lines had coincided in every other case.
