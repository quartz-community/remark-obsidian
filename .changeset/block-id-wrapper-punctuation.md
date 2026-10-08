---
"@quartz-community/remark-obsidian": patch
---

A block identifier inside an inline wrapper is recognised when punctuation follows.

`*^blk*.` registers the block `blk` across the whole line in Obsidian and renders
`<em></em>.`, exactly as `*^blk*` does. Both the text projection and the block scan stopped
at the trailing `.`, so the identifier stayed in the text and no block was reported.
