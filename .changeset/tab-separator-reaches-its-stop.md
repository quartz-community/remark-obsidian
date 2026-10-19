---
"@quartz-community/remark-obsidian": patch
---

A tab in a list marker's separator now reaches its column stop when deciding a definition's
column.

`-` tab `p` gives an item whose content column is **4** — the tab's stop — so a definition
indented four, five or six columns under it sits at column 4. The column was being computed
from the separator's character length, which counts a tab as one, so it came out 2.

`1.` tab `p` was already right, and only by coincidence: its character length is 3 and the
single-digit-dot adjustment lifts that to 4, which is the tab stop by accident. The capped path
for five-or-more-space separators had measured tabs correctly all along; this is the uncapped
path getting the same treatment.

A tab **after** a space still reaches nothing, which is the asymmetry this package records in
three other places: `-` space tab `p` is column 2 — the marker plus its one real space, with
the tab contributing zero. So the separator is truncated at its first tab unless it starts with
one.

Measured as a grid of five marker shapes against seven label indents.
