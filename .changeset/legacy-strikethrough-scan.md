---
"@quartz-community/remark-obsidian": patch
---

The `legacy` strikethrough reader is now linear on a long run of `~~` openers with no closer
(`~~a ~~a ~~a `, or one per line). Each opener used to read to the end of the run. No tree changes.
