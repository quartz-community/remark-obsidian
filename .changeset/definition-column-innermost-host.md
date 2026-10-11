---
"@quartz-community/remark-obsidian": patch
---

A nested footnote definition takes its innermost list item's content column.

`- a` over `  - b` over a blank line over `    [^1]: def` now reports column 4 rather than
the outer item's 2.
