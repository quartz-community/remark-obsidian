---
"@quartz-community/remark-obsidian": patch
---

An unclosed comment in a list item swallows the line below it.

`-  <!--` over `Prose here[^1]` indexes nothing on the second line, as Obsidian does.
