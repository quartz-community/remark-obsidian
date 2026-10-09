---
"@quartz-community/remark-obsidian": patch
---

Two fixes for content a transform or a projection had flattened.

A leftover run after a relabelled link is re-parsed instead of being pushed as one
literal text node, so a `<br>` after a link is html again rather than visible text. Its
leading whitespace is held back and given its own span, since a paragraph drops it.

And the parity harness now entity-encodes a no-break space inside a formula, which is how
Obsidian reports `data-latex` -- the raw character was also being removed by the
comparison's trim before the two sides ever met.
