---
"@quartz-community/remark-obsidian": patch
---

A nested list stops nesting when its parent item carries a later block.

`- a` over `  - b` over a blank line over `  c` reports both items flat, while the same
document with `c` indented four spaces keeps the nesting.
