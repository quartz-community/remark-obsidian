---
"@quartz-community/remark-obsidian": patch
---

A definition behind a list marker with a tab separator starts at the marker.

`1.` followed by a tab, a space and `[^1]: def` reports column 3 rather than the bracket's
column 4.
