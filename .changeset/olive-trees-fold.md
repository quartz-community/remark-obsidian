---
"@quartz-community/remark-obsidian": patch
---

Reach a `$$` opener inside a footnote definition nested in a quote.

The container rule added alongside this only matched a paragraph and an empty
`math` sitting in one child list. A definition inside a quote splits them: the
definition holds the paragraph while the `math` is the definition's sibling, so
the pair was never seen and the block stayed outside.

Placement is the point, not just structure. Obsidian puts the block inside the
definition, and an unreferenced definition is never rendered — so the formula
and its text disappear from the note entirely. Leaving the block outside
rendered content Obsidian does not show.

Two corpus cases, including `quoted-orphan-region-split/1`, which has been
outstanding since the hunt corpus was imported.
