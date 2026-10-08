---
"@quartz-community/remark-obsidian": patch
---

A footnote label of only whitespace defines nothing.

`[^ ]: x` is two paragraphs in Obsidian, rendering `[^ ] [^ ]: x`, where micromark's
gfm-footnote builds a definition named `" "` and hides the body. The asymmetry is
upstream's: a _reference_ `[^ ]` is already refused there, so only the definition half
accepts a label its own reference will not match.
