---
"@quartz-community/remark-obsidian": patch
---

A `%%` comment opened inside a quote no longer closes past the blank line that ends the quote.

An unquoted empty line ends a blockquote, so the quote below it is a new one — and a `%%` opened
in the first cannot reach a closer in the second. We paired them anyway, so the region spanned
both quotes and buried the definition between them:

```
> %%

> [^1]: def
> %%
```

Obsidian keeps `[^1]` live here. Rejecting that closer leaves the region unclosed, which is the
right shape rather than a fallback: an unclosed comment inside a quote is already bounded to its
quote, and that is exactly the extent Obsidian reports.

Three controls keep the rule narrow, all measured against live 1.15.0. At the top level a blank
line ends nothing — an unclosed `%%` runs to the end of the note, blank lines and all. A `>`-only
line keeps its quote open, so the test is emptiness rather than blankness. And a list item with
the same shape was already correct, so this is about quotes specifically, not containers in
general.

Differential harness: 6104 → 6116 of 6818 documents with no regressions, definitions 93.17% →
93.36%.
