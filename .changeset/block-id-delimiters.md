---
"@quartz-community/remark-obsidian": patch
---

Two block-identifier rules, from mining a third-party parser's test suite.

An inline code span's closing backtick frees the caret, so `` `Line.`^blk `` registers
`blk`. And four columns of indent is code, which holds no identifier.
