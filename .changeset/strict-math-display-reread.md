---
"@quartz-community/remark-obsidian": patch
---

Under `strict`, `$$…$$` math in a callout's title or body (and in other re-read fragments) is
display math again, rendered as a block. Formatting such a formula when it holds a `$` no
longer closes it early.
