---
"@quartz-community/remark-obsidian": patch
---

Build a table of the delimiter row's width when it is shorter than the header.

GFM requires the two rows to have the same number of cells and builds nothing
when they differ, so `| a | b |` over `| --- |` is a paragraph. Obsidian builds
a one-column table and drops the surplus header cell, rendering just `a`.

There is no tokenizer to port: measured directly, `remark-parse@8` renders both
cells, so it agrees with neither. Like the body-row pipe rule beside it, this
comes from recorded output — Obsidian's table handling is its own code.

Only a mismatch is handled. Equal counts already build a table upstream, so a
paragraph still holding one means something else declined it, and guessing
there would be wrong.

One corpus case.
