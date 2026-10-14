---
"@quartz-community/remark-obsidian": patch
---

An indented body row ends a piped table rather than belonging to it. `| a | b |` over
`| --- | --- |` followed by ` | c | d |` is a two-line table and then a paragraph in Obsidian;
the indented line had been absorbed as a third row.
