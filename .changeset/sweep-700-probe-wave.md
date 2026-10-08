---
"@quartz-community/remark-obsidian": patch
---

Records sixteen probes drawn from a fuzz sweep, exposing eleven divergences.

Five already matched. The rest are new, attributed debt: a block identifier inside an
inline wrapper followed by punctuation, a bare footnote definition over a whitespace line,
display math inside emphasis across a line ending, a callout title holding `^blk` or `^[]`,
a hidden comment under a setext underline, and a lone `&` as an ordered item's content.
