---
"@quartz-community/remark-obsidian": patch
---

`strict`: a bare `$$` on the last line of a quote, list item or callout, or ending a note with no line ending, is text rather than an empty formula, as in Obsidian: `> $$` and `- $$` render `$$`, and `> a` / `> $$` continues the paragraph. A line after it inside the container still opens the block (`> $$` / `>`), as do lazy lines and a `$$` closing a span opened above.
