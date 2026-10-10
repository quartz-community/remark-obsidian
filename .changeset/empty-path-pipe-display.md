---
"@quartz-community/remark-obsidian": patch
---

A wikilink whose inner starts with a pipe displays that inner verbatim.

`[[|b]]` displays `|b`, where a leading pipe had been read as an alias separator and the
display came out empty.
