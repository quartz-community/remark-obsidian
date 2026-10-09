---
"@quartz-community/remark-obsidian": patch
---

A footnote definition now starts at its containing block's content column.

Obsidian reports the start of the block rather than the position of the `[`, with the
indentation in between belonging to the definition: ` [^1]: def` starts at column 0, and
`- a` over `    [^1]: x` starts at column 2 — the item's content column, not the bracket at 4. Closes 11 of the 17 positional divergences on footnote definitions and moves the
independent referee corpus from 67.5% to 70.8% agreement.
