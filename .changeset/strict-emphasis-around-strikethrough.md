---
"@quartz-community/remark-obsidian": patch
---

Under `strict`, emphasis around strikethrough or a highlight is written so it reads back the
same: `_~~*em*~~_` and `_==**strong**==_` stay emphasis. A `_` marker is no longer chosen where
it would close early: after a tag, or where the content starts or ends with `_`.
