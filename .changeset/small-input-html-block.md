---
"@quartz-community/remark-obsidian": patch
---

`legacy` parses ordinary notes faster: a block not starting with `<` skips the HTML block reader,
which built a regular expression on every call. No reading changes.
