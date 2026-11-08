---
"@quartz-community/remark-obsidian": patch
---

`legacy` no longer takes quadratic time on a long run of `$` that close nothing, such as a line of
prices: once a math opener finds no closer, later openers of its kind in that run skip the search.
The readings are unchanged.
