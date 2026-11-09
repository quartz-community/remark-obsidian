---
"@quartz-community/remark-obsidian": patch
---

A wikilink target that ends in whitespace and then a backslash before `]]` resolves to the target without either, as Obsidian does: `[[a \]]`, `[[ a \|b]]` and `![[ p.png \]]` link to `a` and embed `p.png`, where they resolved to `a ` and `p.png `. The displayed text keeps what was written, and formatting writes the target back as spelled. Both presets.
