---
"@quartz-community/remark-obsidian": patch
---

A tilde fence after a task marker reparses as one.

`- [ ] ~~~~` nests a code block in Obsidian, as four tildes are a fence delimiter rather
than an empty strikethrough. `taskReparseTransform` sliced from the paragraph's own span,
which can start before the checkbox, so it reparsed `[ ] ~~~~`, got a paragraph, and
declined. It now follows the paragraph's children.
