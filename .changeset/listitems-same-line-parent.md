---
"@quartz-community/remark-obsidian": patch
---

List-item nesting within a single line is reported as top-level.

Obsidian's `parent` field is a line number, so `*\t*\t*` — three items all on line 0 —
reports `parent:-1` for all three rather than nesting the last two. The parse was already
correct; only the projection over-reported what the field can express.
