---
"@quartz-community/remark-obsidian": patch
---

A footnote definition now ends before a following label at column zero, rather than absorbing
it as lazy continuation. An indented label is still the definition's own content, so only a
line starting a block of its own ends it.
