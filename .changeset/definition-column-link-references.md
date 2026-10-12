---
"@quartz-community/remark-obsidian": patch
---

A link reference definition's start column follows the same rule as a footnote definition's.

`   [foo]: /url` at root reports column 0, and one inside a list item reports the item's
content column.
