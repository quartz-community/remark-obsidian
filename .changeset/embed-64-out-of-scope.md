---
"@quartz-community/remark-obsidian": patch
---

`fuzz/embed/64` is embed resolution, not parsing, and is re-triaged out of the backlog.
The `![[ ]]` target collapses to empty, Obsidian resolves it to the current note and
embeds the note into itself six levels deep, so one `$**strong**$` is read six times.
Reproducing that needs a vault and recursive inlining, which the renderer owns.
