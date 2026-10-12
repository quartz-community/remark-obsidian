---
"@quartz-community/remark-obsidian": patch
---

A container absorbs a following quote or list line as lazy continuation.

`- a` over a blank over `  [^1]: def` over `> quote` is one list, and an ordered item below
a callout title now nests inside the callout.
