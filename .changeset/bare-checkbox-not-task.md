---
"@quartz-community/remark-obsidian": patch
---

A checkbox with nothing after it on its own line is not a task.

`- [ ]` followed by a lazy continuation reports the plain marker `-` in Obsidian's cache,
not the checkbox character.
