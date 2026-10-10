---
"@quartz-community/remark-obsidian": patch
---

A trailing backslash in a wikilink's heading is kept in the display text.

`[[a#h\]]` resolves to `a#h` and displays `a > h\` in Obsidian's cache. The tokenizer
resolves the escape, so the node's `heading` has already lost it and only the source knows.
