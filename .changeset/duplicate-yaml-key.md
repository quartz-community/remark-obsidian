---
"@quartz-community/remark-obsidian": patch
---

Frontmatter with a duplicate key reports no position.

`footnote-prefix: 2.` over `footnote-prefix: 3.` yields no frontmatter position, as
Obsidian's own cache does.
