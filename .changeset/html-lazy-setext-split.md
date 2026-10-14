---
"@quartz-community/remark-obsidian": patch
---

Split a setext underline off an html lazy line after a list. `- item` / `<div>` / `---`
reports the list ending at `<div>` and a root thematic break in Obsidian; micromark hands the
html line and the underline over as one html node, so the list swallowed both. The prose form
already worked, so this is the same split for a second node type.
