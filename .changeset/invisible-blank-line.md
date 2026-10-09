---
"@quartz-community/remark-obsidian": patch
---

A line of invisible whitespace ends the block above it and becomes its own paragraph.

A no-break space is whitespace to the blank-line test but is not nothing, so `> [li` over
one renders `<blockquote><p>[li</p></blockquote> <p>&nbsp;</p>`. micromark takes the line
as an ordinary lazy continuation and the quote swallows it.
