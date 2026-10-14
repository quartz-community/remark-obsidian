---
"@quartz-community/remark-obsidian": patch
---

An html block a list absorbs lazily no longer carries a `%%` on its next line into the list.
`- item` / `<div>` / `%%` is a list and a root comment in Obsidian; micromark spans the html
node over both lines, so the comment was swallowed with it.
