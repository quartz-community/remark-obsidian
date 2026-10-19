---
"@quartz-community/remark-obsidian": patch
---

A `$$` or an HTML opener inside a quote now swallows the unquoted label below it, as a fence
already did, and it works at any quote depth.

`> <div>` followed by `[^1]: def` reports no definition in Obsidian — the unquoted line is
inside the HTML block, so the label is literal. The same holds for `<!--`, for `$$`, and for a
fence at two levels of quoting, which the fence rule missed because it stripped a single quote
marker rather than a run.

Measured as a grid of eight openers against four hosts. A fence, a `$$` and an HTML opener all
swallow; a `%%` and a plain line already agreed by other means; and a heading does **not**
swallow, which is the negative that bounds the set — a heading ends the container instead of
running past it.

Extending the same rule to a list-marker host is deliberately not done. `- <div>` over `[^1]:`
behaves identically in Obsidian, and admitting it costs 44 documents on the footnote oracle: a
quote marks every line it owns, so "not quoted" means "outside the quote", while an item's
content is bounded by indentation a line scan cannot see.
