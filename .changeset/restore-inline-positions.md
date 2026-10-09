---
"@quartz-community/remark-obsidian": patch
---

Nodes spliced without a position get one back.

`mdast-util-gfm-autolink-literal` builds a `https://` link through
`mdast-util-find-and-replace`, which leaves every node it splices with no position at
all. Passes that need offsets then stand aside -- correctly, but it left
`[^https://e.test/p]` unreachable. The span is tiled from what each child was written as,
and the parent is abandoned untouched if that does not fit exactly.
