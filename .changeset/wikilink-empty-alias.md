---
"@quartz-community/remark-obsidian": patch
---

Render a written-but-empty wikilink alias as empty, matching Obsidian.

`[[a|]]` displays nothing in Obsidian while `[[a]]` displays `a`. A `wikilink` node
carries `alias: ""` for both, so `value` fell through to the path and showed a target
Obsidian hides. The alias **marker** is what distinguishes them, and it is now what marks
the part present.
