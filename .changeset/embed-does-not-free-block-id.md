---
"@quartz-community/remark-obsidian": patch
---

An embed's bracket does not free a block identifier.

`![[\[^1]]]` registers no block, where the link form `[[\[^1]` still registers `1`.
