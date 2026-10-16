---
"@quartz-community/remark-obsidian": patch
---

A tab-marked definition converted to code inside a mixed quote now loses its quote marker like
every other line, instead of leaving a stray `>` in the code's text, and merges with an
adjacent converted block so the quote reports one code block rather than two.
