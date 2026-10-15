---
"@quartz-community/remark-obsidian": patch
---

A callout with no title closes its marker line as its own block, so an ordered item below it
opens a list whatever its start number — the rule already applied to titled callouts. `> [!note]`
over `> 2. [^1]: def` now reports the definition at column 5, where it had stayed paragraph text.
A plain blockquote is unaffected, since its first line really is a paragraph.
