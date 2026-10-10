---
"@quartz-community/remark-obsidian": patch
---

A wikilink's trailing `#` stays in its target.

`[[page#]]` resolves to `page#` rather than `page`. A `#` inside an alias is unaffected —
`[[a|b#c]]` and `[[a|#b]]` both still resolve to `a`.
