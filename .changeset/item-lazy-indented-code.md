---
"@quartz-community/remark-obsidian": patch
---

A lazy line that ends a list item is now root indented code, as it already was for a quote.

`*` four spaces `item` followed by a four-space line is a list and a separate code block in
Obsidian, not one list swallowing the line. The rule already shipped for blockquotes; a list
item needs two extra conditions, both measured.

The line must sit **below the item's own content column** — four spaces under a content column
of five is not the item's content, while the same line under `* item` (content column two) is.
And it must **open a block**: a fence, an ATX heading with its space, a `%%`, or a list marker
of a different kind. Plain text, a quote marker, a thematic break and a link-definition label
are all absorbed as lazy continuation instead, which is the opposite of how a blockquote
behaves — a quote releases any indented lazy line.

The same-marker exclusion is what keeps CommonMark's staircase examples intact: four spaces
then `- e` under three spaces then `- d` is a further item, not code.
