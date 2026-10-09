---
"@quartz-community/remark-obsidian": patch
---

A list item inside a `%%` comment is no longer counted.

`%%` / `- [ ] Hidden task` / `- [x] Also hidden` / `%%` reports no list item in Obsidian
and reported two here. The link, tag and block collectors already skipped comment bodies;
the list-item walk is a separate pass and did not.
