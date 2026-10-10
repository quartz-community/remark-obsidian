---
"@quartz-community/remark-obsidian": patch
---

A footnote definition freed by a comment closer starts one past that closer.

`> %%` over `> hidden` over `> %% [^1]: freed` starts the definition at column 4 rather
than at its bracket.
