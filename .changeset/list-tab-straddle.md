---
"@quartz-community/remark-obsidian": patch
---

A tab split across a container boundary contributes nothing to the inner indent.

` - foo` / `   - bar` / `\t - baz` keeps `baz` a sibling of `bar` in Obsidian where we
nested it two deep. The outer item's content starts at column 3 and the tab spans columns
0 to 4, so the outer container consumes three of its four columns and the leftover
fragment counts for nothing -- leaving only the following space where two columns are
needed.
