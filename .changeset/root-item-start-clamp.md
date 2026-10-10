---
"@quartz-community/remark-obsidian": patch
---

A root list item indented one to three spaces is reported at column 0.

` - a` is reported at column 0 by Obsidian, not at the marker's column 1 — the same
line-start clamp already applied to sections and headings.
