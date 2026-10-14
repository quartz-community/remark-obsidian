---
"@quartz-community/remark-obsidian": patch
---

An html block inside a quote, callout or list item now runs on through the column-zero line
below it, as it already does at the top level and as Obsidian reads it. `- <div>` over
`Text[^2]` is one html block with nothing indexed in it; the line had been a paragraph of its
own with a live reference.
