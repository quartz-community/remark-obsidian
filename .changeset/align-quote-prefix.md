---
"@quartz-community/remark-obsidian": patch
---

A footnote reference inside a quoted multi-line paragraph carries a position.

`> q` over `>   near [^b]` places the reference and the text around it, where a quote's
stripped `> ` prefix had defeated the alignment entirely.
