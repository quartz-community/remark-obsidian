---
"@quartz-community/remark-obsidian": patch
---

Extend a list over an indented block after a blank line

CommonMark says an empty list item takes no further content — cmark's own example 280
reads `-` / blank / `  foo` as a list _and_ a paragraph. Obsidian reads one list, and the
same holds at an ordered marker's wider content column and across a second blank line.

The block is re-parsed dedented by the item's content column, so `    foo` under a nested
item becomes the paragraph it is inside the item rather than the indented code block it
looked like at root.

Only a trailing item that is empty: an item already carrying content needs nothing, and a
blockquote is genuinely two blocks.
