---
"@quartz-community/remark-obsidian": patch
---

A callout now merges with the quote directly below it, as a blockquote already did.

`> [!note] title` / `> # heading` / `lazy` / `> after` is one callout spanning all four lines
in Obsidian. A heading ends the quote upstream, the unindented line becomes a root paragraph,
and the marked line opens a second quote — so the two have to be put back together. That
already happened for a plain blockquote and not for a callout, which arrives as its own node
type, so the callout kept a stray second blockquote beside it.

All four combinations were probed and the merged container always takes the first one's type.
The two with a callout on the **right** are deliberately unchanged: merging moves the second
container's children into the first, and a second callout brings its title with it, which
would claim two titles where Obsidian renders one callout whose `[!tip]` line is body text.
