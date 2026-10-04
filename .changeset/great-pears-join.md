---
"@quartz-community/remark-obsidian": patch
---

Carry a footnote definition into a quote's lazy continuation.

A column-0 line that looks like a definition no more interrupts a blockquote's
lazy continuation than it interrupts a paragraph, so
`> [^1]: quoted def` / `plain column-0 line` / `[^2]: second` is all one
blockquote to Obsidian where we reported a blockquote plus a definition.

A list is deliberately excluded. There the definition belongs folded into the
item's own paragraph, which `footnoteInterruptTransform` does later; absorbing it
here as a sibling child instead renders the body in the footnote list rather than
inline, which costs three cases that already match. Three corpus cases.
