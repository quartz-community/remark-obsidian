---
"@quartz-community/remark-obsidian": patch
---

A definition's column under a list item whose marker is followed by five or more spaces now
falls back to the marker plus one separator, as Obsidian reports it. `*` with nine spaces over
a four-space-indented `[^1]: def` is column 2, not 4, because that much indentation is the
item's own indented code rather than a wider content column.
