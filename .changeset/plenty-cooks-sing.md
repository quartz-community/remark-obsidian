---
"@quartz-community/remark-obsidian": patch
---

Let a container absorb a math block opened on a lazy continuation line.

A column-zero line below a list is lazy continuation, and a `$$` on it opens a
block that belongs to the list rather than beside it — `- item` / `x $$` /
`$$ tail` is one list to Obsidian. The absorb pass already took a paragraph, a
definition and a table; a math block is the same case.

A blank line still ends the container, so an ordinary `$$` block after a list
stays its own node. One corpus case.
