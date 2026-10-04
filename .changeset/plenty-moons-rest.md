---
"@quartz-community/remark-obsidian": patch
---

Clear the residue two earlier passes left behind.

Both are the same shape of bug: a transform repaired the node it was aimed at
and left a sibling artefact that nothing afterwards looked at.

**References to a recovered definition.** The `frontmatter` × `gfm-footnote`
mis-parse labels `[^1]: d` as a link reference definition named `^1`, so every
`[^1]` elsewhere resolves against it and becomes a link reference rendering as
`^1`. Converting the definition back left those pointing at something that no
longer existed; they are now converted with it.

**Quotes split by a lazy continuation.** A column-zero line inside a quote is
lazy continuation and the `>` line below carries on the same quote, but a
definition-shaped continuation ends the quote as a block of its own and the
next `>` opens a second. Absorbing the continuation put the text back without
rejoining the halves, so `> closing words` / `[^9]: orphan` / `> ---` reported
two blockquotes. An immediately adjacent pair is now merged; a blank line
between them still starts a new quote.

Two corpus cases.
