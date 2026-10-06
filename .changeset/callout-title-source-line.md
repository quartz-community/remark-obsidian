---
"@quartz-community/remark-obsidian": patch
---

Decide whether a callout title is a block from the source line

The check read the first text node's value, but the inline tokenizer may already have
taken part of the title into a sibling — and what is left can read as something it is
not. `> [!note] ****strong**` leaves a lone `*` there; `*` alone parses as a list, so the
title was declared a block and the `strong` holding the rest of it was dropped. Obsidian
shows `**strong`, which our own emphasis had produced correctly before this discarded it.

Now judged on the line as written, which is what the rule was always about.

3 cases move from `replicate` to `match`, and three ceilings fall with it: `listItems`
68 → 65 and `tags` 6 → 5, both inflated by the phantom list, and `callout > calloutTitle`
11 → 8.
