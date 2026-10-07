---
"@quartz-community/remark-obsidian": patch
---

Split a wikilink's display form on every `#`, matching Obsidian.

`[[a#b#c]]` reads `a > b > c` in Obsidian; we rendered `a > b#c`. Only the destination
splits on the first `#`, so `heading` is unchanged — it is still what a consumer resolves
against.
