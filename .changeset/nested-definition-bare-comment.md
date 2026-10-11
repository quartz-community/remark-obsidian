---
"@quartz-community/remark-obsidian": patch
---

A nested footnote definition does not absorb an unindented block opener.

`- [^1]: def` over `%%` ends the definition on its own line, as does a heading, fence or
further definition at column 0, since those sit outside the list item.
