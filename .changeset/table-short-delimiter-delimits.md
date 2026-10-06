---
"@quartz-community/remark-obsidian": patch
---

A short delimiter row only builds a table if it delimits cells

`tableShortDelimiterTransform` reproduces Obsidian building a table of the delimiter's
width — `| a | b |` over `| --- |` renders `a` alone. That promotion now obeys the same
precondition as every other table rule: a row whose only pipe is the leading one
declares no columns, so there is nothing to promote.

Recorded both ways, which is what settled it — GFM declines both forms, so only one of
them needed promoting:

| source                       | Obsidian  |
| ---------------------------- | --------- |
| `\| a \| b \|` / `\| --- \|` | table     |
| `\| a \| b \|` / `\| --- `   | paragraph |
| `\| a \| b` / `\| --- `      | paragraph |
| `\| a \|` / `\| --- \| ---`  | table     |

All 16 `probe/table-pipes/*` cases now match.
