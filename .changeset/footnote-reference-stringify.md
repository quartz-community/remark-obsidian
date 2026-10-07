---
"@quartz-community/remark-obsidian": patch
---

Write a footnote reference's label verbatim

`mdast-util-to-markdown` escapes a `[` inside a footnote label, which is right for
CommonMark and wrong here: Obsidian's label runs to the first `]`, so `[^![[img.png]`
re-parses to exactly the label it was written from while `[^!\[\[img.png]` does not.
Re-parsing those escapes gave a label holding backslashes, which the next pass escaped
again.

Inputs that formatting cannot settle drop from 69 to 33 — below the 35 they stood at
before the footnote-label rule landed.
