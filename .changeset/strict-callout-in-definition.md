---
"@quartz-community/remark-obsidian": patch
---

Under `strict`, a callout inside a footnote definition (`[^1]: > [!note] Title`) is now a
callout, as Obsidian renders it in the footnote list and as `legacy` reads it. It was a plain
quote.
