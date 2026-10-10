---
"@quartz-community/remark-obsidian": patch
---

A nested list item reports its parent's content column.

`- Item one` over `    - Nested item` is reported at column 2 by Obsidian, not at the
marker's column 4. A same-line re-parse and a tab-indented child keep their own column.
