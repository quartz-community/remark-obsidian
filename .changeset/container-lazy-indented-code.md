---
"@quartz-community/remark-obsidian": patch
---

A list absorbs a following indented-code line and whatever it was hiding.

`1. p` over `  10.     q` over a tab-indented `%%` over `[^1]: def` is now one list, where
the code node used to break the chain and expose the definition.
