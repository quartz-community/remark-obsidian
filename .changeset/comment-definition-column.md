---
"@quartz-community/remark-obsidian": patch
---

A footnote definition buried inside a `%%` comment now starts at its label rather than at the
start of its line, so the reference Obsidian indexes in its place has the right column.
`- %%` over an indented `[^1]: def` reports the label at column 2; it had reported column 0,
which was only ever right when the label happened to sit there.
