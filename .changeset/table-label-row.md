---
"@quartz-community/remark-obsidian": patch
---

In a table with no outer pipes, a footnote label line is a row.

`a | b` over `--- | ---` over `[^1]: x | y` now extends the table rather than defining `1`.
A piped table, a blank line before the label, and a label with no pipe all still define.
