---
"@quartz-community/remark-obsidian": patch
---

A block identifier alone on its own line is now reported.

`x` / blank / `^b` names the paragraph above it in Obsidian and its own paragraph leaves
the section list entirely. When the next block abuts the identifier instead — `^blk` over
`- item` — that paragraph survives and names itself.
