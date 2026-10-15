---
"@quartz-community/remark-obsidian": patch
---

A `%%` comment opener indented four or more columns is indented code and opens nothing, so the
definitions below it are no longer swallowed. `> x` over a six-space `%%` and a `[^1]: def` now
reports the definition, where the comment had run to the end of the note. A tab reaches the
threshold, and an opener that continues a footnote definition keeps working, since a
definition's own content already sits at four columns.
