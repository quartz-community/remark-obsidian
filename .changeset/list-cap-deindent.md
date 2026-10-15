---
"@quartz-community/remark-obsidian": patch
---

A list item whose marker separator reaches five columns now keeps a following line indented
above its capped content column, rather than ending there. `⟨2sp⟩1.⟨5sp⟩Prose here` over a
four-space `[^1]: Definition` reports the definition inside the item at column 4, as Obsidian
does; it had fallen outside the item and been read as top-level indented code, producing no
definition at all. Items without the cap are unaffected.
