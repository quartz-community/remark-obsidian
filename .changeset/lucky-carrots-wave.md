---
"@quartz-community/remark-obsidian": patch
---

Let a tab continue a footnote definition where four columns would not.

A definition's later blocks have to be indented, and inside a quote the marker
eats part of that budget: `>` then a tab lands short of four columns, so
CommonMark ends the definition and starts a sibling beside it. Obsidian keeps
reading, and `remark-footnotes` agrees — measured on the legacy stack, which
puts the line inside the definition as a second paragraph.

The difference is visible rather than structural. A definition's body renders
in the footnote list at the end of the note, so a block left outside it shows
up inline instead, as text Obsidian never puts there. One corpus case.
