---
"@quartz-community/remark-obsidian": patch
---

Leave an escaped footnote marker written as the author escaped it.

`literal \[^9]` was being reduced to `literal 9`, deleting a marker someone had
deliberately escaped. By the time a text node exists the backslash is gone, so
`\[^9]` and `[^9]` have identical values and the reducer could not tell them
apart.

The pass now walks the source the node came from and records which characters
arrived via an escape, skipping those. The walk is checked against the node's
value and abandoned if it does not reproduce it — character references and
anything else that rewrites text fall back to the old behaviour rather than
trusting a bad alignment.

One corpus case, and the failure mode it removes is the one that matters most
for a formatter: silently rewriting text the author escaped on purpose.
