---
"@quartz-community/remark-obsidian": patch
---

Let a list absorb a definition or table on the line below it.

A column-zero line that looks like a footnote definition or opens a table no
more interrupts a list's lazy continuation than it interrupts a paragraph, so
`-` over `[^3]: real definition` is one list to Obsidian, as is
`-      item` over a definition and a table.

Lists had been excluded from this deliberately: absorbing a definition as a
sibling child used to render its body in the footnote list rather than inline,
costing three cases that already matched. That exclusion is no longer needed.
`footnoteInterruptTransform` now walks into every block container, so a
definition absorbed into a list item is folded into that item's own paragraph
immediately afterwards and the body stays inline. Lifting the restriction with
the fold in place gains two cases and costs none.

Two corpus cases.
