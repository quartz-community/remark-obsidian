---
"@quartz-community/remark-obsidian": patch
---

Keep indented code out of a callout, as it already was out of a plain quote. `> [!note] x`
followed by a four-space line reports the callout and a separate root `code` block in
Obsidian; the code was being absorbed into the callout instead. The lifting pass tested for
`blockquote` only, and `calloutTransform` retypes the node two passes earlier.
