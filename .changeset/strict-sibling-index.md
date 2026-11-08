---
"@quartz-community/remark-obsidian": patch
---

`strict` no longer takes quadratic time in its own passes on a paragraph of many inline nodes,
such as a long run of emphasis or footnote references. Each pass found a visited node's position
by scanning its siblings; it is now the position the walk already holds. The trees are unchanged.
A long run of emphasis or highlights is still superlinear in stock `remark-gfm` and `remark-breaks`,
which scan siblings the same way.
