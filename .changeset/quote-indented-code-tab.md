---
"@quartz-community/remark-obsidian": patch
---

A tab-indented line below a quote now ends the quote and opens a code block, as four spaces
already did. `> x` over a tab-indented line reports a blockquote and a separate code block
rather than one lazily-continued paragraph, matching Obsidian; the indentation had been measured
in characters, where a tab is one character reaching four columns.
