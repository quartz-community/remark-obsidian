---
"@quartz-community/remark-obsidian": patch
---

A footnote definition ends at its last content character.

`> [^9]: stray` / `> [^a]: kept` ends the first definition at the end of its own line
rather than carrying it into the next one.
