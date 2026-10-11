---
"@quartz-community/remark-obsidian": patch
---

An indented paragraph inside a blockquote or callout is read as code.

`> [!info]` over `>     dolor [^b]` keeps the reference literal, as Obsidian does, instead
of indexing it.
