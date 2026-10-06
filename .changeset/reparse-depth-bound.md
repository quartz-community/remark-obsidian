---
"@quartz-community/remark-obsidian": patch
---

Bound transform-chain recursion so a self-reproducing fragment cannot overflow the stack

A pass that locates a body by matching a marker hands back the text it was given when
the match fails, and the chain then re-enters itself on identical input.
`taskReparseTransform` does exactly that for a nested task item whose paragraph
already starts past its own marker.

`reparse` assumed fragments only ever shrink and therefore needed no bound. They do
not, and the result was a stack overflow — a crash, not a divergence. Found by
sweeping the fuzz generator: **55 of 4000** generated documents threw
`Maximum call stack size exceeded`, 37 frames deep.

The depth is now bounded centrally, which covers all 19 passes that take a reparse
callback rather than each guarding separately. At the bound the fragment is still
parsed, just not transformed, so it stays well-formed.

Verified at 0 crashes across 16000 generated documents, with no change to any corpus
case.
