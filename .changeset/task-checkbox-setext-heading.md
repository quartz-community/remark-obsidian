---
"@quartz-community/remark-obsidian": patch
---

A task checkbox is a marker, not part of a setext heading's content.

`- [ ] ~~del~~` over `===` is a heading named `~~del~~` in Obsidian, with the checkbox
counted as the task marker. A task item's paragraph spans from _before_ its checkbox while
its children correctly begin after it, so slicing by the span put `[ ] ` in the heading's
text and name.
