---
"@quartz-community/remark-obsidian": patch
---

Three fixes from cases recorded against other implementations' suites.

A delimiter row may be colons with no dashes, so `|a|` over `|::|` is a centred table. A
callout marker must sit on the blockquote's own first line, so `>` over `> [!note]` is a
plain blockquote. And an html comment inside a list item keeps the rest of its line.
