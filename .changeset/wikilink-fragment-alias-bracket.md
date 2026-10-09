---
"@quartz-community/remark-obsidian": patch
---

A wikilink's fragment and alias keep a lone `]`, as its path already did.

`[[a#^blk](target]]` indexes `a#^blk](target` and `[[a|b](c]]` indexes `a` displaying
`b](c` -- the run continues to the `]]`. Both scans went straight to the closer on the
first bracket and then failed for want of a second, where `path` has always used a
rewindable check. The two had drifted apart.
