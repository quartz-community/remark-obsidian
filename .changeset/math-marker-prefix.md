---
"@quartz-community/remark-obsidian": patch
---

An unclosed `$$` after a list or callout marker stays literal too.

`- $$y`, `1. $$y^2`, `- [ ] $$y^` and `> [!note] $$y` all render the literal `$$…` in
Obsidian with no formula. The container rule tested its prefix for whitespace and `>` only,
so a list or callout marker fell through it.
