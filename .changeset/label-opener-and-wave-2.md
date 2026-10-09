---
"@quartz-community/remark-obsidian": patch
---

A `[` straight after a balanced `]` is a label opener and is not rendered.

`[foo][ref[]` renders `[foo]ref[]`, so the bracket after the closer is consumed and the
label shown bare. The closer has to balance to depth zero -- `[ref[][]` closes an inner
bracket while the outer waits, and renders whole -- and the rule is off inside a link
label, where a bracket is content.

Dropped in the projection, not the tree: Obsidian discards the character, so removing it
from a node value would let a formatter delete a bracket the author wrote.

Adds a 13-case probe wave settling the two families wave 1 left open. Corpus 3291 -> 3304.
