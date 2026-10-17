---
"@quartz-community/remark-obsidian": patch
---

An empty list item is no longer closed by a further blank line, and a tab-indented line below
one belongs to the item rather than to the document.

CommonMark says a list item "can begin with at most one blank line", so `-` followed by a blank
ends the list and an indented line after it becomes a top-level code block. Obsidian inherits
`remark-parse@8`, which keeps the item open: `-` / blank / tab + `[^1]: def` reports a footnote
definition at column 1, where this package reported indented code and no definition at all.

Two halves that are useless apart. The item has to survive the blank line, and the tab-indented
line then has to be accepted as its content with a content column of 1 -- measured identical
across `-`, `- `, `10.` and `10. `, so the marker's width does not enter into it.

The line must still REACH the item's content column: `-    p` or `100. a` put that column past
the tab stop, and a tab-indented line below those is genuinely top-level code on both sides.

Referee agreement 5762 to 5767 of 6818 documents, the code-range dimension unchanged at 742 of
883, and no corpus regressions.
