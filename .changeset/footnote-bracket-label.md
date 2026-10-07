---
"@quartz-community/remark-obsidian": minor
---

Read a footnote label that holds a bracket

A footnote label runs to the **first** `]`, with no balanced counting and nothing parsing
inside it. `[^a[b]c]` renders `a[bc]` — the label `a[b` with `c]` left as text — and
`[^[[a]]]` is a reference to `[[a` with `]]` left as text, where we built a wikilink to
`a`.

That is a different scan from a link label, which _is_ balance-scanned. An outer link
still outranks it: `[^[note]](url)` is a link whose label holds an inline footnote.

This also closes the doubled inline-footnote opener — `[^[^1]` is a reference to `[^1`,
not a dropped construct — so the eighteen cases previously declared unfixable are now
seventeen matches and one `replicate`.
