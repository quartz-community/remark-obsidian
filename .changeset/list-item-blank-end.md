---
"@quartz-community/remark-obsidian": patch
---

A list item separated from its next sibling by a blank line now ends at that line.

`-` / blank / `- b` ends at `1:0` in Obsidian's cache rather than at the marker. The
sibling is what triggers it — a following block, as in `- a` / blank / `para`, leaves the
end at the item's own content.
