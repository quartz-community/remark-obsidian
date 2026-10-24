---
"@quartz-community/remark-obsidian": patch
---

A title-less callout interrupted by an ordered marker no longer holds its line twice.

`calloutTitleInterruptTransform` derives a list from the paragraph at `children[index]`, where
`index` is 1 only when a title occupies `children[0]`. It wrote the result to `children[1]`
unconditionally, so for a title-less callout the paragraph at `children[0]` survived and the
list landed beside it:

    > [!note]
    > 2. [^1]: def

reported `paragraph@2:3` and `list@2:3` as siblings starting at the same point, and the
paragraph's `[^1]` was indexed as a surplus footnote reference Obsidian does not report.

    referee 6229 -> 6233 / 6818   +4 GAINED, 0 LOST
