---
"@quartz-community/remark-obsidian": patch
---

A footnote reference inside a closed HTML comment is no longer indexed.

Obsidian reads nothing inside `<!-- … -->`, so `x <!-- [^1] --> y` holds no reference. The inline
`html` node normally keeps that text away from the bare-reference scan; where an earlier reparse
has flattened it back to plain text, the scan was picking the reference up.

The comment must be closed. Inside an unclosed one the reference stays live — `x <!-- [^1] y`
reports it — so the guard turns on finding a `-->` on the same line.

    referee 6298 -> 6304
