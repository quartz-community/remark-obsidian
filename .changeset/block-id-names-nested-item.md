---
"@quartz-community/remark-obsidian": patch
---

A block identifier inside a nested list item names that item.

`- a` over `  - b ^id` registers the block against the inner item rather than the whole
list.
