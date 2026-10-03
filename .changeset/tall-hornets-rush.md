---
"@quartz-community/remark-obsidian": patch
---

Stop a GFM table interrupting a paragraph, which Obsidian does not allow.

micromark lets a table start on the line directly after prose, so `text` followed
by a header and delimiter row becomes a paragraph plus a table. Obsidian keeps
reading the paragraph and renders the pipes literally. Omitting the blank line
above a table is common enough in real notes that the two readings diverge often.

The table is folded back by parsing each of its lines on its own. Re-parsing the
combined slice would rebuild the same table, since the delimiter row is still
there; one line at a time never has a delimiter row to pair with, so each is read
as the inline content it is — `| *a* | b |` keeps its emphasis. Six corpus cases.
