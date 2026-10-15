---
"@quartz-community/remark-obsidian": patch
---

A footnote reference immediately followed by a `[` is no longer swallowed into a link reference,
so `a[^1][^2]` reports both references instead of none. Adjacent references were being parsed as
one full link reference whenever the names were undefined; defined names were already correct. A
`[` after ordinary link text still opens a label, so `a[text][^1]` is unchanged.
