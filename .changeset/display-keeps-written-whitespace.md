---
"@quartz-community/remark-obsidian": patch
---

A wikilink's display keeps the path's written whitespace.

`![[*\u00a0*]]` resolves to a target with a plain space while displaying the no-break space
the author typed.
