---
"@quartz-community/remark-obsidian": patch
---

An ordered item below a callout title opens a list whatever its start number.

`> [!note] title` over `> 2. item` is now a list, where the `2.` had stayed text. A plain
quote still keeps it as text, since a quote's first line is a paragraph.
