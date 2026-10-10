---
"@quartz-community/remark-obsidian": patch
---

A bracket that becomes a link frees its caret for a block identifier.

`[^1](u)` registers the block `1` and `[^blk](u)` registers `blk`, with no escape needed —
the label can never be a footnote reference. An image does not: `![^1](url)` registers
nothing.
