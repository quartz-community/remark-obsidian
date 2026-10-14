---
"@quartz-community/remark-obsidian": patch
---

A list item's content column is the smallest indentation among its own lines, not its marker's
width, so a continuation line indented below the marker pulls the definition column down with
it. `- a` over a one-space lazy line and a four-space `[^1]: def` is a definition at column 1;
it had been reported at 2. A column-0 lazy line is left out of that minimum, which is the half
of the rule that was already right, and a tab counts to its four-column stop.
