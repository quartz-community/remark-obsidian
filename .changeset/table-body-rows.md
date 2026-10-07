---
"@quartz-community/remark-obsidian": patch
---

A promoted table keeps its body rows.

`|a|` over `|---|---|` over `|b|c|` is one table in Obsidian. `tableShortDelimiterTransform`
built the header and delimiter and reparsed everything after them as separate blocks, so the
body row came back as a paragraph.
