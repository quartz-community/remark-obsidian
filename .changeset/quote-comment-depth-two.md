---
"@quartz-community/remark-obsidian": patch
---

An unclosed `%%` opened inside a quote two or more levels deep now swallows the lines below it,
as Obsidian has it. A definition on one of those lines stops defining and its label is indexed
as a reference, matching the asymmetry already applied to a comment at one level or at the
document's root. A closed comment, and one followed by a blank line or any line that ends the
quote, are untouched.
