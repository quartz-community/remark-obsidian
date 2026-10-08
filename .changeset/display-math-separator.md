---
"@quartz-community/remark-obsidian": patch
---

No separator after inline display math on its own line.

`$$y^2$$` over `word` reads `⟨math⟩word` in Obsidian, with no separator, where every other
line ending in a paragraph reads as one — the rendered formula is a block-level element, so
the `<br>` beside it contributes nothing to `textContent`.
