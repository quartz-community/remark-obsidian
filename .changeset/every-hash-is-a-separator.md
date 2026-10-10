---
"@quartz-community/remark-obsidian": patch
---

Every `#` in a wikilink becomes a heading separator in the display.

`[[a#^blk a#^blk]]` displays `a > ^blk a > ^blk`, where only the first separator had been
converted.
