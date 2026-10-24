---
"@quartz-community/remark-obsidian": patch
---

A reference in a callout body with an empty title keeps its position.

A callout whose title is whitespace-only — `> [!note] ` with a trailing space — leaves the body
paragraph's span starting just past the consumed title, which on the following line is the line
ending and the container prefix rather than the value's first character:

    > [!note]⎵
    > ab[^1]        text value `ab[^1]`, span starting at the `\n`

`alignToSource` could not map an index in that value back to a source offset, so every node it
spliced lost its position — and a reference with no position is invisible to the referee and
untouchable by a consumer that splices by offset. A fourth alignment mode skips a leading line
ending and the container prefix on the line it opens. It runs only when the three before it
fail, so no alignment that already succeeds can change.

    referee 6234 -> 6236 / 6818   +2 GAINED, 0 LOST
    unplaced nodes                54 -> 52 across 27 -> 25 documents
