---
"@quartz-community/remark-obsidian": patch
---

Collect links and embeds in document order when recording.

The recorder queried `a.internal-link` and `.internal-embed` separately and
concatenated, so every link preceded every embed regardless of where they
sat. 46 cases differed on ordering alone while both sides had found exactly
the same targets.

One query returns them in document order, and the rule that only source-level
embeds count is unchanged — a transcluded note renders its own embeds inside
the outer one, so counting descendants would report three for a single
`![[ ]]`.

This is a harness fix, not a parser one: 42 cases move to matching and 44
goldens change, all of them reorderings.
