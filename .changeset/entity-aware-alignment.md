---
"@quartz-community/remark-obsidian": patch
---

Resolve character references when aligning a text node to its source

`bareFootnoteRefTransform` aligns a text node's value against its source slice so a
spliced reference can carry both a position and the label as written. That alignment
modelled escapes only, so a value holding a resolved entity could never match: `[^&amp;]`
reaches the node as `[^&]`, the rebuilt string stayed `[^&amp;]`, and the alignment
returned `null`.

Everything downstream then degraded silently — the references and surrounding text were
spliced with no position, and the label lost its written form.

2 cases move from `replicate` to `match`, positionless nodes 52 → 49, and three ceiling
entries fall with `heading > text` reaching zero. A stale lossiness exception for one of
them is gone too.
