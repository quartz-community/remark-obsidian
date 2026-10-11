---
"@quartz-community/remark-obsidian": patch
---

A footnote definition ending at the start of a line now ends on the previous one.

Its span had been one line long, holding only the preceding line's ending. A definition that
opened a `%%` or `<!--` region keeps its old end, since there the line is its own closer.
