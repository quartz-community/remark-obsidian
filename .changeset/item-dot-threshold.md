---
"@quartz-community/remark-obsidian": patch
---

A single-digit `1.` marker moves its item's indented-code threshold out by one, matching the
adjustment already applied to the definition column. `1. item` over a seven-space `[^1]: def`
is a definition at column 4; it had been read as indented code and produced no definition.
