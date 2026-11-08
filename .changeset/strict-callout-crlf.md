---
"@quartz-community/remark-obsidian": patch
---

Under `strict`, a callout with no title (`> [!note]`, `> [!note]-`) now forms over `\r\n` line
endings, and displays its type as it does over `\n`. It was read as a plain quote.
