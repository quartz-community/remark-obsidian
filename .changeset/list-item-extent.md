---
"@quartz-community/remark-obsidian": patch
---

A list item no longer overlaps the item after it.

`remark-math` extends an item past its sibling's start when a `$$` opener shares its line
with content; the item's end is now clamped to where the next one begins.
