---
"@quartz-community/remark-obsidian": patch
---

A nested footnote definition does not absorb an unindented comment marker.

`- [^1]: def` over `%%` ends the definition on its own line, since the marker sits outside
the list item.
