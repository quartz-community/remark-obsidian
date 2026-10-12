---
"@quartz-community/remark-obsidian": patch
---

A demoted display-math block is wrapped in a paragraph.

An unclosed `$$` inside a quote, callout, list item or footnote definition became a bare
text node directly inside that container, where mdast requires flow content.
