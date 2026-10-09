---
"@quartz-community/remark-obsidian": patch
---

Two ordering and whitespace fixes.

A link inside an inline footnote is now indexed after every other link, which is where
Obsidian puts it: the renderer relocates the footnote body to a trailing section and
`metadataCache` follows, so an embed written earlier on the line is reported last.

And a construct spanning a rebuilt line ending no longer keeps the continuation line's
indentation. The block parser strips it before any inline tokenizer sees it, so `==a` over
`··===` is the highlight `a⏎=` rather than `a⏎··=`.
