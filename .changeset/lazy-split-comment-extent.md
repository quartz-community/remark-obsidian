---
"@quartz-community/remark-obsidian": patch
---

An unclosed `%%` split off a lazily-absorbed definition now runs to the end of the note.
`> [!note] title` / `[^1]: def` / `%%` is a callout and a comment swallowing everything after
it in Obsidian; the comment had been bounded at its own line, leaving the trailing paragraph
as a section Obsidian does not report.
