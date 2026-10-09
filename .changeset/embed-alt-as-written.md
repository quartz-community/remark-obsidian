---
"@quartz-community/remark-obsidian": patch
---

An embed's display text is now the alt as written, not as rendered.

`![foo [bar](u)](v)` displays `foo [bar](u)` in Obsidian's cache, where mdast's flattened
`alt` gives `foo bar`. Sliced from the source instead.
