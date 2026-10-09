---
"@quartz-community/remark-obsidian": patch
---

A `[` straight after a `]` opens a link label, not a wikilink.

`a [x][[w]] b` renders `a [x][w]] b` in Obsidian and indexes no link -- the first bracket
of the `[[` is a label opener for the text that just closed. After a footnote reference, a
wikilink or an inline footnote the `[[` still opens a wikilink, and an embed is unaffected
because its `!` keeps the bracket off the closer.
