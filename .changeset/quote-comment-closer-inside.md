---
"@quartz-community/remark-obsidian": patch
---

A comment opened inside a quote is not closed by a marker outside it.

`> %%` over `> x` over `%%` over `[^1]: def` defines nothing, where the unprefixed marker
had been read as the comment's closer.
