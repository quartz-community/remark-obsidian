---
"@quartz-community/remark-obsidian": patch
---

A footnote definition inside a list item absorbs a following unclosed `$$` line, so the
definition ends on that line as Obsidian reports it. `- [^a]: Definition` over an indented `$$`
now spans both lines, at every indent including column zero; the `$$` had been a separate math
block and the definition ended one line early. A closed `$$` region stays its own block, and a definition at the root is unaffected.
