---
"@quartz-community/remark-obsidian": patch
---

A pipe row must actually delimit cells to make a table

GFM treats the outer pipes as optional, so `| a` over `| ---` builds a table. Obsidian
reads it as a paragraph: a leading pipe is a wall rather than a separator, so a row
carrying only that one delimits nothing.

| source                        | Obsidian  |
| ----------------------------- | --------- |
| `\| a` / `\| ---`             | paragraph |
| `\| a \|` / `\| ---`          | paragraph |
| `\| a` / `\| --- \|`          | paragraph |
| `\| a \| b` / `\| --- \| ---` | table     |
| `a \| b` / `--- \| ---`       | table     |

A row with no leading pipe needs only one, which is why `a | b` is a row and `| a` is
not. The rule applies to the header and the delimiter alike — either one failing means
no table.

Found by a fuzz sweep: 128 failures reduced to 118 causes, and this was the one real
cluster with eight independent seeds landing on it. 11 of 12 new `probe/table-pipes/*`
cases match, from 7 before.
