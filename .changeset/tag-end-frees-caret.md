---
"@quartz-community/remark-obsidian": patch
---

A tag's end frees the caret for a block identifier. `#tag^blk` registers `blk` in Obsidian
where `word^blk` registers nothing, so it is the tag and not the word character before the
caret. Read from the tree's `tag` nodes rather than a pattern, so `a#tag^blk` and `#1^blk`
correctly register nothing.
