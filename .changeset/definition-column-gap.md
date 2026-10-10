---
"@quartz-community/remark-obsidian": patch
---

A footnote definition in a list item takes the content column only when it clears it by two.

`1. item` over `    [^1]: def` starts at the bracket, where `- item` over `    [^1]: def`
starts at the item's content column.
