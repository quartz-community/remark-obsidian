---
"@quartz-community/remark-obsidian": patch
---

A tab after a space in a list marker's separator does not widen the item.

The reference rules group `- <TAB>` with `- ` and `-     ` at a content column of 2, while
`-<TAB>`, `-<TAB><TAB>` and `10.<TAB>` sit at 4 — a tab reaches its column stop only when it
_opens_ the separator, and after a space it contributes nothing.

`contentColumn` already measured it that way. The item's own `size` did not, so
`- <TAB>item` / blank / `<2sp>[^1]: def` left the definition at ROOT and, because the item was then
one line, read its content as indented code:

```
listItem@0-0 > code@0-0        and footnoteDefinition at root
```

`columnsOfRaw` has a single caller — the item's `size`, an ownership threshold, which is where that
asymmetry belongs by its own docstring's reasoning.

Measured: a 144-cell grid over the reference rules' full marker table goes from 2 diverging cells to
0; the probe ledger moves from 1594 agreeing to 1612, every one of the 18 reporting "NOW AGREES
with Obsidian"; the compute oracle drops from 24 diverging projections to 21, lowering three
recorded ceilings (`footnotes` 5→4, `listItems` 5→4, `sections` 2→1); and footnote agreement moves
from 6015/6818 to 6018/6818 with zero regressions, verified by identity.
