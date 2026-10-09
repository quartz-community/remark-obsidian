---
"@quartz-community/remark-obsidian": patch
---

A list continuation indented five or more belongs to the item.

`remark-parse@8` strips the minimum indentation across the whole item, so ` -    one`
over `     two` -- content at offset 6, continuation at 5 -- is one item with two
paragraphs rather than an item and a block of indented code. Measured across eight
marker widths: the join threshold is `min(contentOffset, 5)`, the cap being one past
indented code's own reach.
