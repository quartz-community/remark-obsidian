---
"@quartz-community/remark-obsidian": patch
---

A list item ends at its last content character when a construct outlives it.

`- $$y` ends at `0:5` in Obsidian's cache rather than on the next line, and
`- a` / `    %%` / `    b` ends at `2:5`. Items separated from a sibling by a blank line
keep their existing end, which is the line start.
