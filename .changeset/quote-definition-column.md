---
"@quartz-community/remark-obsidian": patch
---

A footnote definition in a blockquote starts at the quote's content column.

`>  [^1]: def` and `>   [^1]: def` both start at column 2, where the extra padding
belongs to the definition rather than moving its start.
