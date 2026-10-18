---
"@quartz-community/remark-obsidian": patch
---

A quoted footnote definition no longer ends at a block opener separated from the quote marker
by a TAB.

`> [^1]: def` followed by `>` tab `- item` continues the definition in Obsidian: the tab puts
the line's content four columns in, where it is indented code, so the marker is not opening a
block. The quote prefix was consuming a tab as if it were the marker's space, which made the
opener test fire.

Every space separator is unchanged, as are a tab before a heading or a fence, which already
continued on both sides.

Referee agreement 5841 to 5844 of 6818 documents, the code-range dimension unchanged, and no
corpus regressions.
