---
"@quartz-community/remark-obsidian": patch
---

An inline footnote inside a highlight reports as a marker, not as its body.

`# ==^[inline]==` reports the highlight's content as the footnote marker. The lighter text
collector handled `[^1]`-style references but not the inline `^[…]` form, so its body
leaked into whichever construct enclosed it.
