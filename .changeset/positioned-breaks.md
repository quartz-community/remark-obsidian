---
"@quartz-community/remark-obsidian": minor
---

Convert soft line endings into positioned `break` nodes

`remark-breaks` is four lines that throw positions away. It calls `newlineToBreak`,
which is `findAndReplace(tree, [/\r?\n|\r/g, replace])`; `replace` returns a bare
`{type: "break"}` and `findAndReplace` rebuilds the surrounding text as
`{type: "text", value}` — no position on any of the three.

Doing the same conversion first, with positions, leaves its regular expression nothing
to match, so the tree is identical and every node keeps its place. This package is
ordered before `remark-breaks` in the chain, which is what makes that possible.

Across the recorded corpus that places **1020 of 1188** previously positionless nodes —
512 breaks and 641 text halves, 97% of every unplaced node. Ten of the twenty
parent-child pairs in the position ceiling drop to zero outright.

New `positionedBreaks` option, on by default. Turn it off for a chain with no
`remark-breaks`, where a soft line ending is not a `break` at all.

A newline written as a character reference is the one case this declines: `&#10;` puts
a newline in the value with none in the source, so the offsets would be guesses. One
document in 2811.
