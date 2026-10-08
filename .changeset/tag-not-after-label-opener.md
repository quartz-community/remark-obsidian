---
"@quartz-community/remark-obsidian": patch
---

A tag does not start inside an unclosed `[[` or `![[`.

` ![[#t` reports no tag in Obsidian — the `#` sits in literal text. A tag may begin straight
after a _completed_ inline construct, so `a[[t]]#next` tags `next`, but micromark emits an
`exit` for the `[` opener token itself, which made an unfinished label look like a finished
construct.
