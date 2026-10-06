---
"@quartz-community/remark-obsidian": patch
---

A body row that delimits no cells ends the table

The same rule the header and delimiter rows obey now applies to body rows: a leading
pipe alone separates nothing, so `| a |` over `| --- |` followed by `| b` is a table
plus a paragraph rather than a three-row table.

`tableRowStyleTransform` already ended a table where a body row disagreed with the
header about outer pipes, but it tested only whether the row _started_ with a pipe —
so `| a |` and `| b` agreed and nothing was cut.

Completes the family: all 12 `probe/table-pipes/*` cases now match.
