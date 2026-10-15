---
"@quartz-community/remark-obsidian": patch
---

A list item's de-indentation minimum moves where its indented code begins, not just where its
definitions start, so a label four or more characters past the lowered content column is code
and defines nothing. `- a` over a one-space continuation and a five-space `[^1]: x` now yields
no definition, matching Obsidian; it had produced one at the lowered column. A tab counts as
one character here and a tab following a space counts as nothing, which is the same asymmetry
the definition column already applied.
