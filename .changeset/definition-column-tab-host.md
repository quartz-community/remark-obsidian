---
"@quartz-community/remark-obsidian": patch
---

A definition under an indented, tab-separated list marker starts at the label's own column.

`definitionColumnTransform` reports a definition's start as its containing block's content
column, and for a tab-indented label it counted the tab run alone. Under an _indented_ host whose
marker separator holds a tab, the spaces after that tab count too — so `   -\t    More` over
`\t    [^x]: body` starts at column 5, not 1.

Measured against the oracle as a grid of four hosts by five label indents. Unindented
tab-separated hosts define nothing at all and are untouched.

    referee 6293 -> 6297
