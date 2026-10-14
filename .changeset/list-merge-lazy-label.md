---
"@quartz-community/remark-obsidian": patch
---

Two lists separated only by a lazily-absorbed footnote label are one list, as Obsidian reads
them. `- apples` / `[^1]: from the market` / `- pears` is a single two-item list; it had been
reported as two lists, because the label arrives as its own block and is absorbed only after
micromark has closed the first list.
