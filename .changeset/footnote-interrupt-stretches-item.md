---
"@quartz-community/remark-obsidian": patch
---

A list item now covers a footnote definition folded into its trailing paragraph.
`> - item` / `[^1]: def` left `listItem 2->8` holding a `paragraph 4->18`, because the fold
stretched the list and the paragraph but not the item between them.
