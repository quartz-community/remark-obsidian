---
"@quartz-community/remark-obsidian": minor
---

Add `legacyLists`, replacing CommonMark's list container with Obsidian's.

Obsidian runs a fork of `remark-parse@8`, whose list parsing is more permissive than
CommonMark's. The first divergence covered: an ordered marker has **no nine-digit
ceiling**, so `1234567890. not ok` is a list with `start=1234567890` rather than a
paragraph.

Off by default until the remaining divergences in the family are measured.
