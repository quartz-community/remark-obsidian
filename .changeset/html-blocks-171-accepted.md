---
"@quartz-community/remark-obsidian": patch
---

`commonmark/html-blocks/171` is a rendering divergence, not parse debt, and is re-triaged
out of the backlog. `<textarea>` is RCDATA to the HTML parser, so the detached recorder
swallows the rendered blocks after it while a real Reading View renders them as
paragraphs. Obsidian's own section parse sides with us, and the recorded golden mixes one
projection from each renderer.
