---
"@quartz-community/remark-obsidian": patch
---

A tag does not start straight after a literal `]`.

`# [^1[[a#^blk\]]#tag` reports no tag: the reference's label runs to the first `]`, the
next `]` is ordinary text, and a `#` against it is text too. After a _construct's_ closer
a tag does start -- `a[[t]]#next` reports one -- which the tokenizer cannot distinguish
and the tree can.
