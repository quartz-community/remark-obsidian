---
"@quartz-community/remark-obsidian": patch
---

A footnote definition under a bare `-` is now the setext heading Obsidian reports, not a
definition followed by an empty list. A hyphen run with trailing whitespace stays a real list
marker, so `[^1]: x` over `- ` keeps its definition while `[^1]: x` over `-` does not.
