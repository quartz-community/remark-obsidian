---
"@quartz-community/remark-obsidian": patch
---

A paragraph that absorbs a comment's lines now covers them.

Folding a `%%` back into a footnote definition's paragraph extended the definition's span
and left the paragraph's own end behind, so its children reached past it.
