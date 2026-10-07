---
"@quartz-community/remark-obsidian": patch
---

A callout marker's type may not span a line ending

The type pattern was `[^\]]+`, which matches a newline — so an unclosed `[!` found its `]`
on the next line and produced a callout whose type spanned both. `> [!n` over `note]` was
a callout of type `n\nnote`, where Obsidian reads an unclosed marker as ordinary prose.
