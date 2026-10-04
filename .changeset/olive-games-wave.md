---
"@quartz-community/remark-obsidian": patch
---

Open a code block for an indented line below a quote.

CommonMark cannot start indented code inside a paragraph, so `> quote` /
`> more` / `    code` reads the third line as more of the quoted paragraph.
Obsidian ends the quote there and opens a code block. That changes what the text
means rather than only its shape: code is literal, so a `[^1]` inside stays
written instead of being read as a footnote reference. Two corpus cases.
