---
"@quartz-community/remark-obsidian": patch
---

Keep a callout a callout when it holds a setext underline. `> [!note] title` followed by
`> ---` or `> ===` was degrading to a plain blockquote, because micromark reads the marker
line and the underline as one setext heading and the callout pass accepted only a paragraph
as the quote's first child.
