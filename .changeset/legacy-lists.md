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

On by default: turning it on costs **0 regressions** across the 3103-case parity corpus
for 5 cases gained, and improves the independent `metadataCache` oracle on two counters.

Two cases in the family remain and are recorded rather than chased -- a tab-indented
sibling, and an under-indented continuation that needs `remark-parse@8`'s whole-item
minimum-indent scan rather than a different limit.
