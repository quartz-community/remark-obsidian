---
"@quartz-community/remark-obsidian": patch
---

An unclosed `[` swallows the footnote label that closes it.

Obsidian's link-reference-definition reader scans from a `[` to the first `]` without stopping at
a blank line, which CommonMark forbids. So where the first `]` after a stray `[` is the one
inside a later `[^1]:` label, that label is consumed as part of the link label and never defines
— rule D6. References are unaffected.

The test is the _first_ `]`, not the presence of one: `[a` / blank / `b]: /url` closes on `b]`
before it ever reaches the footnote, and there the definition stands.

Gated on `legacyLinkDefinitions`, since a link label may not contain a blank line in CommonMark.

    referee 6252 -> 6255
