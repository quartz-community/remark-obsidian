---
"@quartz-community/remark-obsidian": patch
---

A closing bracket after a block identifier must close a bracket that opened.

`  ^blk](![[note]]` registers no block, where the identifier had been accepted on the
strength of the `]` alone.
