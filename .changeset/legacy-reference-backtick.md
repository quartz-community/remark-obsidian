---
"@quartz-community/remark-obsidian": patch
---

`legacy` reads a bare `&` after a character reference and a backtick as remark-parse 8 (and
Obsidian) does: ``&#0`&/`` keeps its `` `&/ ``, where the reader's speed-ups read the `&` as
U+FFFD.
