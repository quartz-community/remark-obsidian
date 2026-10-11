---
"@quartz-community/remark-obsidian": patch
---

Nothing ends a footnote definition more than 1024 characters into it.

A heading, fence, list item or label starting at or past that point is ordinary text of the
definition, as `remark-footnotes@2` and Obsidian both read it.
