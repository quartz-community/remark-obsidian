---
"@quartz-community/remark-obsidian": patch
---

A trailing backslash in a wikilink's path is kept in the display text.

`[[target\]]` resolves to `target` and displays `target\`, matching the rule already
applied to a trailing backslash in the heading.
