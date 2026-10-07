---
"@quartz-community/remark-obsidian": patch
---

Drop a continuation line's indent from a highlight

A paragraph's continuation line loses its indent everywhere else in micromark, so a
construct that consumes raw characters has to drop it too. `==a` / `    b==` held
`a\n    b` where the same text outside a highlight holds `a\nb`.
