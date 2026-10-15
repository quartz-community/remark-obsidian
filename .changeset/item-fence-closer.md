---
"@quartz-community/remark-obsidian": patch
---

An indented closing fence below a list item now closes the item's own fenced block instead of
opening a new one. `- a` over an indented `~~~`, a column-zero line, and a matching indented
`~~~` ends the fence there, so the rest of the document is parsed normally; the closer had
started a second block that ran to the end of the note and swallowed everything after it. A
column-zero closing fence still opens a block of its own, as Obsidian has it.
