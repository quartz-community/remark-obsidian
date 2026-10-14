---
"@quartz-community/remark-obsidian": patch
---

A footnote definition a list or quote absorbs lazily is folded into that block's paragraph as
Obsidian reports it, and its continuation line becomes a block of its own. `- item` /
`[^1]: def` / `%%` is a list and a root comment with no definition at all; the definition had
survived inside the item, because the fold tested adjacency with line numbers that a
by-offset splice leaves stale.
