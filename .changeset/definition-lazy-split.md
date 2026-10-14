---
"@quartz-community/remark-obsidian": patch
---

A footnote definition a callout absorbs lazily keeps only its own line, so the indented line
under it becomes a root code block as Obsidian reports it. `> [!note] title` / `[^1]: def` /
`    code` gave one callout spanning all three lines; it is now the callout, a root `code`,
and a definition ending on its own line.
