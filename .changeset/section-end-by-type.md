---
"@quartz-community/remark-obsidian": patch
---

A section's reported end is clamped to its content for container types.

A list, footnote definition or paragraph whose mdast span runs past its content is now
reported at the content, while an unclosed fence, html block, math span or comment keeps
the end Obsidian reports for it.
