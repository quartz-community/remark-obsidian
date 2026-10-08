---
"@quartz-community/remark-obsidian": patch
---

A document whose frontmatter fence never closes parses normally again.

`---` followed by `1. x` is a thematic break and a list in Obsidian.
`micromark-extension-frontmatter`'s construct is `concrete`, so opening on line one and
finding no closing fence degraded every container in the rest of the document to a
paragraph — the list on line two and any later one equally. Everything after the fence line
is now re-parsed once and spliced back with its real offsets.
