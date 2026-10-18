---
"@quartz-community/remark-obsidian": patch
---

A footnote definition inside a blockquote now ends at a quoted list marker or a quoted label,
as it already did at a quoted heading or fence.

`> [^1]: def` followed by `> - item` or `> [^2]: two` ran the first definition over the second
line, so its span was one line too long and anything indexed on that line belonged to the wrong
definition. Obsidian ends it, exactly as it ends one at `> # head` or `> ```.

Referee agreement 5767 to 5796 of 6818 documents, the code-range dimension unchanged at 742 of
883, and no corpus regressions.
