---
"@quartz-community/remark-obsidian": patch
---

An indented line after a link reference definition is indented code, not a paragraph.
`[ref]: /url` followed by a four-space line reports `definition` then `code` in Obsidian; a
definition is a closed block, so CommonMark's "indented code cannot interrupt a paragraph"
rule does not apply to it. Scoped to link definitions: a footnote definition's indented line
is its own content and is untouched.
