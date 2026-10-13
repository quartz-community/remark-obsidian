---
"@quartz-community/remark-obsidian": patch
---

Lift a column-zero `%%` out of NESTED containers too. `> > quote` / `%%` and `- - item` / `%%`
put the comment in the inner container, where a one-level lookup found nothing and it stayed
buried. Every ancestor now shrinks, deepest first, so no outer span keeps covering a line it
no longer owns.
