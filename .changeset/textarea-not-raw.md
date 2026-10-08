---
"@quartz-community/remark-obsidian": patch
---

`<textarea>` no longer swallows the blocks after it.

micromark counts `textarea` as a raw-text element; Obsidian's parser predates that and
keeps only `{pre, script, style}`. So `<textarea>` over a blank line and two paragraphs is
four blocks to Obsidian and was one to us. `pre`, `script` and `style` are untouched.
