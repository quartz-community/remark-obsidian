---
"@quartz-community/remark-obsidian": patch
---

A block identifier in an inline wrapper is recognised whatever follows the wrapper.

`*^blk* word` and `*^blk*, word` both register `blk` and render only their tail. The tail
was restricted to punctuation, which was as far as the evidence went; probes now settle it.
`x ^a_b` still registers nothing, because a closing marker has to have opened.
