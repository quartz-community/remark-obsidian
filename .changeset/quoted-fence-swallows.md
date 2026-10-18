---
"@quartz-community/remark-obsidian": patch
---

A footnote definition on an unquoted line directly below a quoted fence opener no longer
defines.

`> ``` ` followed by `[^2]: def` puts that line inside the fence in Obsidian, so it is literal
content and defines nothing. This package read it as a live definition, which also made the
reference to it resolve.

A quoted line below the opener was already handled, and a blank line before the unquoted one
ends the quote so the content is live again — both are unchanged.

Referee agreement 5803 to 5812 of 6818 documents, the code-range dimension unchanged at 742 of
883, and no corpus regressions.
