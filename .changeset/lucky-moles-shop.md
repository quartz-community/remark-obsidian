---
"@quartz-community/remark-obsidian": patch
---

Fold a footnote definition into the prose above it inside any block container.

A definition may not interrupt a paragraph, which this package already handled at
the top level and under a list item. The same is true inside a quote, a callout
and a nested item, so `> para` / `> [^q]: quoted under prose` is one paragraph to
Obsidian where we reported a paragraph plus a definition — and the difference is
visible, because a definition renders in the footnote list rather than inline.

The pass now walks into every block container and resolves a quote or callout
host to its own trailing paragraph, the way it already did for a list. Seven
corpus cases, from several fixture families that looked unrelated by edit shape.
