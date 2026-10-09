---
"@quartz-community/remark-obsidian": patch
---

Two display-math boundary rules.

A `$$` at the end of a callout title opens no block: the title is one line, so nothing can
follow the opener and nothing can close it, and `> [!note] $$` renders the literal `$$`.

And a column-zero `$$` after a container whose last block is not a paragraph is its own
block rather than a lazy continuation -- `> <br>` over `$$⇥[` is a blockquote _and_ a
math, because the `<br>` closed the only block a lazy line could have joined.
