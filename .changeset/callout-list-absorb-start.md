---
"@quartz-community/remark-obsidian": patch
---

Only an ordered list that could not have interrupted is absorbed into a callout.

`> [!note] title` over `- item` or `1. item` keeps its list, where previously any list after
a callout title was folded in.
