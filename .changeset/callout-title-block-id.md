---
"@quartz-community/remark-obsidian": patch
---

A callout title holding a block identifier renders empty.

`> [!note] ^blk` registers the block `blk` and shows a title with nothing in it. The
identifier scan hosted paragraphs and headings but not callout titles, so the `^blk` stayed
in the title text.
