---
"@quartz-community/remark-obsidian": patch
---

A footnote definition under a list item takes the item's full content column.

`-   p` over `     [^1]: def` starts at column 4, and a tab in the definition's own indent
puts it just past that tab.
