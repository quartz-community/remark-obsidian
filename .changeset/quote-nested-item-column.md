---
"@quartz-community/remark-obsidian": patch
---

A list item nested inside a blockquote reports its parent's content column.

`> - a` over `>    - b` reports column 4, where the quote prefix had hidden the parent's
content column from the lookup.
