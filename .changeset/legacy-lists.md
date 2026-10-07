---
"@quartz-community/remark-obsidian": minor
---

Add `legacyLists`, replacing CommonMark's list container with Obsidian's.

Obsidian runs a fork of `remark-parse@8`, whose list parsing is more permissive than
CommonMark's. Two divergences covered:

- an ordered marker has **no nine-digit ceiling**, so `1234567890. not ok` is a list with
  `start=1234567890` rather than a paragraph
- a sibling marker may be indented up to the open item's own indent rather than a fixed
  three spaces, so ` - a` / `  - b` / `   - c` / `    - d` is four flat items rather than
  three and an indented code block

Off by default until the remaining divergences in the family are measured.
