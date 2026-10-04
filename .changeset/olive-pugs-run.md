---
"@quartz-community/remark-obsidian": patch
---

Let a footnote definition recovered from a comment tail read the line below it.

The tail after a closing `%%` is parsed on its own, so a definition found there
ended where that line did. Obsidian treats it as a definition written normally, so
`%%`/`hidden`/`%%[^1]: def` followed by `text` is one definition holding both
lines. Without the lazy continuation the second line stayed a paragraph and
rendered in the body, where Obsidian shows nothing at all. Two corpus cases.
