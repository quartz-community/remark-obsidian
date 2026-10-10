---
"@quartz-community/remark-obsidian": patch
---

A wikilink is no longer mistaken for a task checkbox.

`1. [[]]` reports the plain list marker, where the checkbox scan had captured `[` out of
the wikilink's brackets.
