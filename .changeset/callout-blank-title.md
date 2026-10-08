---
"@quartz-community/remark-obsidian": patch
---

A written-but-empty callout title displays nothing, where an absent one displays the type.

`> [!note]` alone renders `Note`, the capitalised type; `> [!note]  ` with a trailing
whitespace run renders nothing at all. The title gate keyed on the collected text after a
`trim()`, which made the two indistinguishable.
