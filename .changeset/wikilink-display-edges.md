---
"@quartz-community/remark-obsidian": patch
---

Two wikilink display rules.

An empty alias displays nothing rather than falling back to the path, so `[[a|]]` resolves
to `a` and displays empty. And a vault heading search strips its whole `#` run, so
`[[## heading text]]` displays `heading text`.
