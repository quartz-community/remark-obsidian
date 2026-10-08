---
"@quartz-community/remark-obsidian": patch
---

Inline constructs survive a line ending in two more places.

A `%%` comment with no closer now hides what follows it however deeply nested, so `> > %%`
over a lazy line renders nothing. Inline math inside emphasis is recognised across a line
ending, and so is an inline footnote spanning a lazy continuation line — `- ^[i` over `e]`
is one note.
