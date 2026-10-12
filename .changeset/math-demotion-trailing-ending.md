---
"@quartz-community/remark-obsidian": patch
---

A demoted display-math block no longer keeps its trailing line ending.

Its span ran through the ending after the block, which is right for a flow node and wrong
for the text replacing it, so the result reached past its own container.
