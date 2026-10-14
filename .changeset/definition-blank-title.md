---
"@quartz-community/remark-obsidian": patch
---

A link reference definition's title may start after a blank line, as Obsidian reads it.
`[foo]: /url` followed by a blank line and `'the title'` is one definition carrying that title,
so a footnote reference inside the title is dead; it had been a separate paragraph with a live
reference. The title text is preserved on the node, so a formatter does not drop it.
