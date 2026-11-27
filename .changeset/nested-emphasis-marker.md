---
"@quartz-community/remark-obsidian": patch
---

Formatting under `legacy` keeps emphasis nested in emphasis that cannot be written with `_` (such as one opening on a line break, `**` / `_a_` / `_*e`): the inner one is now written with `_`, so reading the output back no longer closes the outer one at the inner one's opener.
