---
"@quartz-community/remark-obsidian": patch
---

A tab-led nested list marker no longer loses its footnote definition.

`- a` / `    - b` / `\t\t- [^1]: def` defines `[^1]` inside the item that the `- ` on its own
line opens. The pass that implements "a tab past a list item's content column is indented code"
was testing that definition against every _ancestor_ item, and the outer item's content column
of 2 is overshot by a single tab advancing to column 4 — after which the character it inspects
is the second tab, so the label was pruned. Stock parsing gets this right, and we were also
dropping the item's content entirely, leaving a `listItem` with no children.

Bounded to a tab-led indent, which is the asymmetry B2 describes: `\t\t` counts as inside the
item, `  \t` is code and still prunes.

    referee 6249 -> 6251
