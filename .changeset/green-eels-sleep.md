---
"@quartz-community/remark-obsidian": patch
---

Reduce a stripped footnote reference to its lowercased identifier.

Obsidian shows the identifier rather than the label as written, so `[^Cell]`
nothing defines reads `cell` and `[^P.]` reads `p.`; we were keeping the original
case. The same normalisation fixes a latent bug in the revival path added
alongside it: mdast lowercases a definition's identifier, so looking it up with
the label as written missed every reference whose label was not already
lowercase. Two corpus cases.
