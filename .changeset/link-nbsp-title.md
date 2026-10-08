---
"@quartz-community/remark-obsidian": patch
---

A no-break space separates a link's destination from its title.

`[link](/url\u00a0"title")` is the destination `/url` with the title `title` in Obsidian.
CommonMark does not count U+00A0 as whitespace, so the whole thing was read as one
destination. Only U+00A0 is affected; an ordinary space is left to the tokenizer.
