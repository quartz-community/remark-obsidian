---
"@quartz-community/remark-obsidian": patch
---

A list folded into a footnote definition from a later line reports no items.

`[^1]: body` over `2. item text` reports no list item, where a list on the definition's own
line still does.
