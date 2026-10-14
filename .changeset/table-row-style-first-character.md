---
"@quartz-community/remark-obsidian": patch
---

A body row's leading pipe is now read at the table's own content column rather than after its
indentation, so an indented row in a pipeless table stays a row. `a | b` / `--- | ---` /
`  | c[^2] | d` kept all three rows in Obsidian and stock micromark while we dropped the third
and killed the reference in it.
