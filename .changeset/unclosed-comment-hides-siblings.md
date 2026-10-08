---
"@quartz-community/remark-obsidian": patch
---

A `%%` comment with no closer hides what follows it in the same container.

`1. %%note` over `===` renders nothing in Obsidian. An unclosed comment usually absorbs
what follows it, so skipping the node was enough; inside a list item a `===` line lands
beside it instead, and the sibling still rendered.
