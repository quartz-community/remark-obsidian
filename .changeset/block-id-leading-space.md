---
"@quartz-community/remark-obsidian": patch
---

A leading space keeps a block-identifier line prose.

`^blk` alone is reported as no section at all, while ` ^blk` is reported as a paragraph.
The space sits before the paragraph's start offset, so trimming the node's own text never
saw it.
