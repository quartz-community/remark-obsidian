---
"@quartz-community/remark-obsidian": patch
---

`legacy`: a table indented one to three spaces before its first `|` reads that `|` as the end of an empty first cell, as Obsidian does (`   | a |` / `   | - |` renders one empty header cell). Obsidian reads such a table as pipeless, so every cell moves one column right. `strict` keeps GFM's reading.
