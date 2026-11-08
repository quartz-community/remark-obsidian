---
"@quartz-community/remark-obsidian": patch
---

Formatting keeps an empty strikethrough (`~~~~` mid-line, which Obsidian reads as one) with `mdast-util-gfm-strikethrough` 2.0.1, which writes strikethrough as attention and dropped it as empty.
