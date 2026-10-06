---
"@quartz-community/remark-obsidian": patch
---

Place a callout title that parses as a block

When a callout's title line is a block rather than prose — a heading, a list, a
definition — `titleLineIsBlock` reparses that line on its own and the result was spliced
in unshifted. Every node kept offsets numbered from the line instead of the note.

A wrong offset is worse than a missing one because it still looks usable, and this shows
why: `> [!note] # h` was indexed as heading `1:> [`, the name sliced from the top of the
document at offset 0 instead of the title at offset 10.

Besides fixing the heading name, the positioned oracle's `footnotes` divergences drop
from 46 to 43 and `listItems` from 69 to 68 — those reports were being corrupted by the
same offsets.
