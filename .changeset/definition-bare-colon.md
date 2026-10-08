---
"@quartz-community/remark-obsidian": patch
---

A bare `[^1]:` absorbs nothing.

`[^1]:` over `x` is a definition and a separate paragraph, where `[^1]: ` with a trailing
space is one definition holding `x`. `definitionLazyTransform` absorbed both.
