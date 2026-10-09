---
"@quartz-community/remark-obsidian": patch
---

A blank line does not end an empty list item, and any indent after it nests.

`-` / blank / `  -` / blank / `    foo` is one flat two-item list for us and nests the
second item under the first in Obsidian. CommonMark lets an item begin with at most one
blank line, so micromark ends the empty item there; `remark-parse@8` keeps it open. The
threshold is one column rather than the content column, because an empty item has no
content to set a column against.
