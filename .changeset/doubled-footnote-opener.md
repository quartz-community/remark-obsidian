---
"@quartz-community/remark-obsidian": patch
---

A `[^` before an inline footnote's `^[` is a reference opener and wins.

`[^[^1]` is a footnote reference whose label runs to the first `]`, so the label is `[^1`
and renders bare. We built an inline footnote, because `^[` opens one and our construct
saw that `^` first. Done as a repair, since declining `^[` after a `[` in the tokenizer
is already refuted -- it lets the wikilink win instead.
