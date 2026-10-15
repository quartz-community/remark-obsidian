---
"@quartz-community/remark-obsidian": patch
---

A fenced code block inside a list item now keeps lines indented less than the item's content
column, so its content is no longer split out into a paragraph. `*⟨4sp⟩~~~` over three-space
content and a matching closer is one code block, and a `[^1]` written inside it stays buried as
Obsidian has it; the fence had closed empty and the content had become live text. A blank line
still ends the item, and a shallower line outside a fence still begins a sibling.
