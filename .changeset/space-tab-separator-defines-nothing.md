---
"@quartz-community/remark-obsidian": patch
---

A footnote label whose list-marker separator is spaces followed by a tab is no longer a
definition.

`*` two-spaces `[^1]: def` is a definition in Obsidian; `*` two-spaces tab `[^1]: def` is not.
The trailing tab is what kills it, and the two agreeing cases either side are what make it the
tab rather than the width.

This is the tab-after-space asymmetry seen from the other side. The package already measures
that such a tab contributes nothing to a list item's content column; what this adds is that the
same tab still reaches its column stop for the indented-code threshold, which puts the label
four columns in and makes its brackets literal. One tab, two answers, depending on which
question is being asked.
