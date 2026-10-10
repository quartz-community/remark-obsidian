---
"@quartz-community/remark-obsidian": patch
---

A multi-line list item ends at its last content character.

`- a` over a blank line over `  b` ends at `b`, where only a single-line item ends at the
blank line that follows it.
