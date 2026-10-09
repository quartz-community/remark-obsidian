---
"@quartz-community/remark-obsidian": patch
---

The indent that makes a line code inside a quote is read from the ancestry.

A footnote definition continues at four spaces, so inside one code needs eight -- a rule
the pass already had, but it asked the blockquote's immediate parent. With a quote nested
in a quote that parent is a `blockquote`, so `[^1]: > > <ma` over
`    target]]. [![[#tag]]](u)` had its continuation cut into code and the link and embed
inside it went unindexed.
