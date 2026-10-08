---
"@quartz-community/remark-obsidian": patch
---

A footnote definition takes a trailing whitespace-only line into its span.

`[^1]:` over six spaces is one `footnoteDefinition` covering both lines, and so is
`[^1]: b` over six spaces — a body makes no difference. A whitespace-only line followed by
content does not extend it, and neither does a truly empty line.
