---
"@quartz-community/remark-obsidian": patch
---

A `[[` inside a wikilink's fragment abandons the opener, as it already did inside the path.

`![[d.pdf#page=3. [[word]]` built an embed whose heading was `page=3. [[word`; Obsidian
abandons the opener and lets the inner wikilink win. A single `[` is still ordinary
content, so targets like `[link](u)` are unaffected.
