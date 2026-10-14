---
"@quartz-community/remark-obsidian": patch
---

A blank line bounds an unclosed `$$` that a list absorbs. `- item` / `$$` / blank /
`use[^1]` reports the list ending at the opener and a live paragraph below in Obsidian; the
formula was swallowing the rest of the note, losing a `footnoteReference` out of the tree.
Scoped by two measured guards: the opener must directly follow a list, and what follows the
blank line must be at column zero, since an indented line continues the item instead.
