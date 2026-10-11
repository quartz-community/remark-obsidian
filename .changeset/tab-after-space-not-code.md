---
"@quartz-community/remark-obsidian": patch
---

A tab after a space does not make an indented code block inside a quote.

`>   ` followed by a tab and `[^1]: def` is a footnote definition at column 2, where it had
been read as code.
