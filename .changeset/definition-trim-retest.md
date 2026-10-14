---
"@quartz-community/remark-obsidian": patch
---

A footnote definition no longer ends on a blank line when the line that follows it holds
content. The trim already existed but applied once: its blank-line loop declines when the end
sits on a content line, and the column fallback then pulls the end back one line, exposing
blanks the loop never examined. Re-testing after the fallback closes 36 referee documents.
