---
"@quartz-community/remark-obsidian": patch
---

Do not carry an inline construct across a callout's title boundary

A construct spanning the title's line ending swallows the `break` the title/body split
looks for, so no top-level break existed and the whole construct was taken as the title:
`> [!note] *em` / `em*` reported one emphasis and an empty body.

Obsidian forms no such construct — it reports the text `*em em*` with no emphasis — because
the title ends at the line ending and the two markers then sit in different blocks. Each
side is now reparsed on its own.

A construct that fits on the title line is unaffected, and a quoted body is its own block
and keeps its own.
