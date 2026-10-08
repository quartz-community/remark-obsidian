---
"@quartz-community/remark-obsidian": patch
---

A link label of only whitespace resolves against its definition, and a shortcut reference
serialises as its own label.

`[⏎ ]` over `[⏎ ]: /uri` is an anchor with no content in Obsidian. The parse half was
reverted once because `mdast-util-to-markdown` collapses `[text][reference]` to `[text]`
only when the two spell the same thing, and escaping made them differ — so the formatter
wrote the label twice. A `linkReference` handler fixes that, and both now round-trip at a
fixed point.
