---
"@quartz-community/remark-obsidian": patch
---

A setext underline under a link reference definition is recognised in its `---` form as well
as its `===` form. `[ref]: /url` over `---` is an `<h2>` reading `[ref]: /url` in Obsidian
with no definition created, which the existing pass already reproduced for `===` but declined
for `---`, where micromark builds a `thematicBreak` rather than paragraph text.
