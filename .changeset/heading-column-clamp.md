---
"@quartz-community/remark-obsidian": patch
---

A heading's reported column now matches Obsidian for an indented heading.

` ### foo` is reported at column 0 by Obsidian, not at the `#`. The sections projection
already applied that clamp; the headings projection did not.
