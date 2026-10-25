---
"@quartz-community/remark-obsidian": patch
---

An unplaced reference inside a footnote definition now gets its source position.

The bare-reference pass splices a reference whose offsets could not be established by alignment,
and a node without a position is invisible to the metadata oracle — so a reference we found was
reported as missing. The offset is recovered from the source by scanning for the label's own
`[^name]` and discarding occurrences an already-placed reference owns.

Scoped to references inside a footnote definition, which is the only subset where Obsidian
indexes every unplaced position; elsewhere it declines some, and placing indiscriminately costs
more than it gains.

    referee 6297 -> 6298, unplaced references 52 -> 49
