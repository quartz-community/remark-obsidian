---
"@quartz-community/remark-obsidian": patch
---

Show `<!-->` and `<!--->` as text, which is what Obsidian does.

CommonMark 0.30 added these two empty-comment short forms and micromark
implements them, so they parse as HTML and render as nothing. Obsidian's parser
predates the change and shows them literally. That makes the difference visible
rather than structural: the characters are in the note, and we were dropping
them. Three corpus cases.
